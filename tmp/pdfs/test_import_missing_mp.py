import unittest

from import_cke_package import (
    is_closed_choice_task, is_key_running_header, solution_marker, solution_label,
    shared_context_targets,
    parse_closed_answer,
)
from import_missing_mp import sessions


class MissingMaturaTests(unittest.TestCase):
    def test_legacy_abcd_without_prompt(self):
        self.assertTrue(is_closed_choice_task("Liczba jest równa A. 1 B. 2 C. 3 D. 4"))
        self.assertTrue(is_closed_choice_task("Mediana jest równa A. 3 B. 2 C. 1 D. 1/2"))

    def test_open_geometry_is_not_a_choice(self):
        self.assertFalse(is_closed_choice_task("Dany jest czworokąt ABCD. Oblicz pole trójkąta ABC."))
        self.assertFalse(is_closed_choice_task("Punkty A, B, C i D leżą na okręgu. Wykaż tezę."))

    def test_existing_choice_formats(self):
        self.assertTrue(is_closed_choice_task("Wybierz odpowiedź A. 1 B. 2"))
        self.assertTrue(is_closed_choice_task("Oceń prawda czy fałsz"))

    def test_sessions_do_not_collide(self):
        available = [session for session, _ in sessions()]
        self.assertEqual(len(available), 15)
        self.assertEqual(len({session.json_path for session in available}), 15)
        for session in available:
            if session.year >= 2023 and session.formula == "2015":
                self.assertIn("f2015", session.output_dir.name)
                self.assertIn("f2015", session.stem)

    def test_solution_headings(self):
        for heading in ["Przykładowe pełne rozwiązania", "Sposób 1.", "Sposób 2. (równość długości ramion)"]:
            self.assertEqual(solution_marker(heading), "solution")
        self.assertEqual(solution_label("Sposób 2. (równość długości ramion)"), "Sposób 2")
        self.assertIsNone(solution_marker("Stosujemy sposób 2. i otrzymujemy wynik"))

    def test_running_header_is_not_grading_heading(self):
        self.assertTrue(is_key_running_header({"text":"Zasady oceniania rozwiązań zadań", "top":36}))
        self.assertFalse(is_key_running_header({"text":"Zasady oceniania", "top":36}))

    def test_shared_context_targets(self):
        self.assertEqual(shared_context_targets("Informacja do zadań 7. i 8."), ["7", "8"])
        self.assertEqual(shared_context_targets("Informacja do zadań 11.–13."), ["11", "12", "13"])
        self.assertEqual(shared_context_targets("Informacja do zadań 7. i 9."), ["7", "9"])
        self.assertEqual(shared_context_targets("Arkusz zawiera informacje"), [])

    def test_answer_variants_are_not_two_answer_questions(self):
        for text, expected in [("A A", "A"), ("B D", "B"), ("C C", "C")]:
            section = {"header": {"number":"3"}, "lines": [
                {"text":"Rozwiązanie"}, {"text":"Wersja A Wersja B"}, {"text":text},
            ]}
            self.assertEqual(parse_closed_answer(section), expected)


if __name__ == "__main__":
    unittest.main()
