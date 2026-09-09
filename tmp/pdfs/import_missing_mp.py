"""Import the missing basic matura sessions without modifying existing sets."""

import argparse
import json
from html.parser import HTMLParser
from urllib.parse import urljoin
from urllib.request import Request, urlopen

import pdfplumber

from import_cke_package import (
    ROOT, EXAM_META, MONTH_CODES, MONTH_LABELS, TERM_CODES,
    Session, audit_session, import_session,
)


WORK = ROOT / "tmp/pdfs/missing-mp"
REPORT = WORK / "report.json"
MONTHS = {"maj": "main", "czerwiec": "additional", "sierpien": "resit"}


def sessions():
    rows = [(2022, "czerwiec", "2015"), (2022, "sierpien", "2015")]
    rows += [(2026, "sierpien", "2023")]
    for year, month, formula in rows:
        term = MONTHS[month]
        suffix = {"main": "", "additional": "_dodatkowy", "resit": "_poprawkowy"}[term]
        formula_suffix = "_f2015" if year >= 2023 and formula == "2015" else ""
        slug = month + suffix + formula_suffix
        stem = f"{year}_cke_p_{MONTH_CODES[month]}_{TERM_CODES[term]}{formula_suffix}"
        kind, level, level_code, label = EXAM_META["01_matura_podstawowa"]
        session = Session(
            exam_folder="01_matura_podstawowa", kind=kind, level=level,
            level_code=level_code, label=label, year=year, term=term,
            month=month, formula=formula, source_dir=WORK / str(year) / slug,
            output_dir=ROOT / "zadania/mp" / str(year) / slug,
            stem=stem, detail=f"{year} / {MONTH_LABELS[month]} / formuła {formula}",
        )
        old = "stara-" if formula == "2015" and year >= 2023 else ""
        resit = "poprawkowa-" if term == "resit" else ""
        url = f"https://arkusze.pl/matura-{old}{resit}matematyka-{year}-{month}-poziom-podstawowy/"
        yield session, url


class PdfLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href", "")
        if tag == "a" and href.lower().endswith(".pdf") and href not in self.links:
            self.links.append(href)


def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as response:
        return response.read()


def download(session, url):
    session.source_dir.mkdir(parents=True, exist_ok=True)
    parser = PdfLinks()
    parser.feed(fetch(url).decode("utf-8"))
    links = [urljoin(url, href) for href in parser.links]
    source = {"page": url, "pdfs": {}}
    for link in links:
        role = "key" if "odpowiedzi" in link or "zasady" in link else "exam"
        if role in source["pdfs"]:
            raise RuntimeError(f"Multiple PDFs for {role}: {links}")
        path = session.key_pdf if role == "key" else session.exam_pdf
        if not path.exists():
            content = fetch(link)
            if not content.startswith(b"%PDF-"):
                raise RuntimeError(f"Not a PDF: {link}")
            path.write_bytes(content)
        with pdfplumber.open(path) as pdf:
            first_page = pdf.pages[0].extract_text() or ""
            if "matematyk" not in first_page.lower() or str(session.year) not in first_page:
                raise RuntimeError(f"Unexpected document: {path}: {first_page[:300]}")
            source["pdfs"][role] = {"url": link, "pages": len(pdf.pages)}
    (session.source_dir / "sources.json").write_text(json.dumps(source, ensure_ascii=False, indent=2) + "\n")
    return source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["download", "audit", "import"])
    parser.add_argument("--only", default="")
    parser.add_argument("--skip", default="")
    parser.add_argument("--regenerate", action="store_true")
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    report = json.loads(REPORT.read_text()) if REPORT.exists() else {}
    failures = 0
    for session, url in sessions():
        identity = f"{session.year}:{session.output_dir.name}"
        if args.only and not identity.startswith(args.only):
            continue
        if args.skip and identity.startswith(args.skip):
            continue
        print(f"{args.action}: {identity}", flush=True)
        entry = report.setdefault(identity, {"source": session.source_config})
        if session.year == 2026 and session.month == "sierpien":
            entry["status"] = "skipped-awaiting-official-key"
            entry.pop("error", None)
            REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
            continue
        try:
            if args.action == "download":
                entry["download"] = download(session, url)
                entry["status"] = "downloaded" if session.key_pdf.exists() else "missing-key"
            elif not session.exam_pdf.exists() or not session.key_pdf.exists():
                entry["status"] = "missing-pdf"
            elif args.action == "audit":
                entry["audit"] = audit_session(session)
                entry["status"] = "audited"
            elif session.json_path.exists() and not args.regenerate:
                print("Already imported; keeping existing files", flush=True)
            else:
                if session.output_dir.exists() and "import" not in entry:
                    raise RuntimeError("Refusing to replace a set not created by this import")
                audit = audit_session(session)
                if not audit["tasks"] or audit["missingKeySections"] or audit["missingClosedAnswers"]:
                    raise RuntimeError(f"Incomplete source: {audit}")
                entry["audit"] = audit
                entry["import"] = import_session(session, replace=args.regenerate)
                entry["status"] = "imported"
            entry.pop("error", None)
        except Exception as error:
            entry["error"] = str(error)
            failures += 1
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(entry, ensure_ascii=False), flush=True)
    if failures:
        raise SystemExit(f"Failed sessions: {failures}")


if __name__ == "__main__":
    main()
