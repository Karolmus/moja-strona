import html
import math

import sympy as sp

x, y, a = sp.symbols("x y a")

SVG_WIDTH = 640
SVG_HEIGHT = 360
SVG_MARGIN = 42


def _as_expr(value):
    return sp.Rational(str(value))


def _as_float(value):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None

    return result if math.isfinite(result) else None


def _as_real_float(value):
    numeric = sp.N(value)

    if abs(float(sp.im(numeric))) > 1e-9:
        return None

    return _as_float(sp.re(numeric))


def _fmt(value):
    return f"{value:.2f}".rstrip("0").rstrip(".") or "0"


def _range_from_values(values, default=(-5, 5), min_span=4, padding=0.16):
    finite_values = [value for value in (_as_float(item) for item in values) if value is not None]

    if not finite_values:
        return default

    low = min(finite_values)
    high = max(finite_values)
    center = (low + high) / 2
    span = max(high - low, min_span)
    span *= 1 + padding

    return center - span / 2, center + span / 2


def _equal_aspect_range(x_min, x_max, y_min, y_max):
    plot_width = SVG_WIDTH - 2 * SVG_MARGIN
    plot_height = SVG_HEIGHT - 2 * SVG_MARGIN
    target_aspect = plot_width / plot_height

    x_span = max(x_max - x_min, 1)
    y_span = max(y_max - y_min, 1)
    current_aspect = x_span / y_span

    if current_aspect < target_aspect:
        new_span = y_span * target_aspect
        center = (x_min + x_max) / 2
        x_min = center - new_span / 2
        x_max = center + new_span / 2
    else:
        new_span = x_span / target_aspect
        center = (y_min + y_max) / 2
        y_min = center - new_span / 2
        y_max = center + new_span / 2

    return x_min, x_max, y_min, y_max


def _ticks(low, high, count=4):
    if high == low:
        return [low]

    return [low + (high - low) * i / count for i in range(count + 1)]


def _svg_canvas(x_range, y_range, draw, title, equal_aspect=False):
    x_min, x_max = x_range
    y_min, y_max = y_range

    if equal_aspect:
        x_min, x_max, y_min, y_max = _equal_aspect_range(x_min, x_max, y_min, y_max)

    plot_width = SVG_WIDTH - 2 * SVG_MARGIN
    plot_height = SVG_HEIGHT - 2 * SVG_MARGIN
    x_scale = plot_width / (x_max - x_min)
    y_scale = plot_height / (y_max - y_min)

    def sx(value):
        return SVG_MARGIN + (value - x_min) * x_scale

    def sy(value):
        return SVG_HEIGHT - SVG_MARGIN - (value - y_min) * y_scale

    grid = []

    for tick in _ticks(x_min, x_max):
        position = sx(tick)
        is_axis = abs(tick) < 1e-9
        color = "#334155" if is_axis else "#d9e1ea"
        width = 1.5 if is_axis else 1
        grid.append(
            f'<line x1="{_fmt(position)}" y1="{SVG_MARGIN}" x2="{_fmt(position)}" '
            f'y2="{SVG_HEIGHT - SVG_MARGIN}" stroke="{color}" stroke-width="{width}"/>'
        )
        grid.append(
            f'<text x="{_fmt(position)}" y="{SVG_HEIGHT - 14}" text-anchor="middle" '
            f'font-size="11" fill="#64748b">{html.escape(_fmt(tick))}</text>'
        )

    for tick in _ticks(y_min, y_max):
        position = sy(tick)
        is_axis = abs(tick) < 1e-9
        color = "#334155" if is_axis else "#d9e1ea"
        width = 1.5 if is_axis else 1
        grid.append(
            f'<line x1="{SVG_MARGIN}" y1="{_fmt(position)}" x2="{SVG_WIDTH - SVG_MARGIN}" '
            f'y2="{_fmt(position)}" stroke="{color}" stroke-width="{width}"/>'
        )
        grid.append(
            f'<text x="12" y="{_fmt(position + 4)}" font-size="11" '
            f'fill="#64748b">{html.escape(_fmt(tick))}</text>'
        )

    elements = draw(sx, sy, x_scale, y_scale, x_min, x_max, y_min, y_max)

    return (
        f'<svg class="calculator-plot-svg" viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}" '
        f'role="img" aria-label="{html.escape(title)}" xmlns="http://www.w3.org/2000/svg">'
        '<rect width="100%" height="100%" rx="12" fill="#ffffff"/>'
        f'{"".join(grid)}'
        f'{elements}'
        "</svg>"
    )


def _path(points, color="#2563eb", width=3):
    commands = []
    drawing = False

    for point in points:
        if point is None:
            drawing = False
            continue

        px, py = point
        command = "L" if drawing else "M"
        commands.append(f"{command}{_fmt(px)} {_fmt(py)}")
        drawing = True

    if not commands:
        return ""

    return (
        f'<path d="{" ".join(commands)}" fill="none" stroke="{color}" '
        f'stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'
    )


def _point(cx, cy, color="#111827", radius=4):
    return f'<circle cx="{_fmt(cx)}" cy="{_fmt(cy)}" r="{radius}" fill="{color}"/>'


def _circle(sx, sy, x_scale, cx, cy, radius, color):
    return (
        f'<circle cx="{_fmt(sx(cx))}" cy="{_fmt(sy(cy))}" r="{_fmt(abs(radius * x_scale))}" '
        f'fill="none" stroke="{color}" stroke-width="3"/>'
    )


def _line_points_for_slope(slope, intercept, x_min, x_max, sx, sy):
    return [(sx(x_min), sy(slope * x_min + intercept)), (sx(x_max), sy(slope * x_max + intercept))]


def _solution_points(result):
    points = []

    for item in result:
        if isinstance(item, dict):
            raw_x = item.get(x)
            raw_y = item.get(y)
        else:
            raw_x, raw_y = item

        point_x = _as_real_float(raw_x)
        point_y = _as_real_float(raw_y)

        if point_x is not None and point_y is not None:
            points.append((point_x, point_y))

    return points


def bernoulli(p, n, k_values):
    p = _as_expr(p)
    q = 1 - p
    total = 0

    for i in range(n + 1):
        prob = sp.binomial(n, i) * p**i * q ** (n - i)

        if i in k_values:
            total += prob

    return total


def bernoulli_plot(p, n, k_values):
    p = _as_expr(p)
    q = 1 - p
    selected = {int(item) for item in k_values}
    probabilities = [float(sp.binomial(n, i) * p**i * q ** (n - i)) for i in range(n + 1)]
    max_probability = max(probabilities) if probabilities else 1
    max_probability = max(max_probability, 0.01)
    chart_left = 44
    chart_right = SVG_WIDTH - 22
    chart_top = 26
    chart_bottom = SVG_HEIGHT - 44
    chart_width = chart_right - chart_left
    chart_height = chart_bottom - chart_top
    gap = 2
    bar_width = max((chart_width - gap * n) / (n + 1), 2)
    bars = [
        f'<line x1="{chart_left}" y1="{chart_bottom}" x2="{chart_right}" y2="{chart_bottom}" '
        'stroke="#334155" stroke-width="1.5"/>'
    ]

    for i, probability in enumerate(probabilities):
        height = chart_height * probability / max_probability
        x_pos = chart_left + i * (bar_width + gap)
        y_pos = chart_bottom - height
        color = "#2f6b36" if i in selected else "#8eb5de"
        opacity = "0.95" if i in selected else "0.65"

        bars.append(
            f'<rect x="{_fmt(x_pos)}" y="{_fmt(y_pos)}" width="{_fmt(bar_width)}" '
            f'height="{_fmt(height)}" rx="3" fill="{color}" opacity="{opacity}"/>'
        )

        if n <= 20:
            bars.append(
                f'<text x="{_fmt(x_pos + bar_width / 2)}" y="{SVG_HEIGHT - 18}" '
                f'text-anchor="middle" font-size="11" fill="#64748b">{i}</text>'
            )

    return (
        f'<svg class="calculator-plot-svg" viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}" '
        'role="img" aria-label="Bernoulli distribution chart" xmlns="http://www.w3.org/2000/svg">'
        '<rect width="100%" height="100%" rx="12" fill="#ffffff"/>'
        f'{"".join(bars)}'
        "</svg>"
    )


def poly_solve(coeffs):
    coeffs = [_as_expr(item) for item in coeffs]

    while len(coeffs) > 1 and coeffs[0] == 0:
        coeffs = coeffs[1:]

    if not coeffs or all(item == 0 for item in coeffs):
        raise ValueError("Polynomial cannot have only zero coefficients.")

    degree = len(coeffs) - 1
    f = sum(coefficient * x ** (degree - index) for index, coefficient in enumerate(coeffs))
    expanded = sp.expand(f)
    factored = sp.factor(expanded)
    roots = sp.solve(expanded, x)

    return roots, factored, expanded, polynomial_plot(expanded, roots)


def polynomial_plot(expression, roots):
    real_roots = [root for root in (_as_real_float(item) for item in roots) if root is not None]
    x_min, x_max = _range_from_values(real_roots + [-4, 4], min_span=8)
    samples = []
    y_values = [0]

    for i in range(180):
        value_x = x_min + (x_max - x_min) * i / 179

        try:
            value_y = float(expression.subs(x, value_x))
        except (TypeError, ValueError, OverflowError):
            samples.append(None)
            continue

        if not math.isfinite(value_y) or abs(value_y) > 1e8:
            samples.append(None)
            continue

        samples.append((value_x, value_y))
        y_values.append(value_y)

    y_min, y_max = _range_from_values(y_values, min_span=4)

    def draw(sx, sy, _x_scale, _y_scale, _x_min, _x_max, _y_min, _y_max):
        points = [None if item is None else (sx(item[0]), sy(item[1])) for item in samples]
        markers = "".join(_point(sx(root), sy(0), "#2f6b36", 5) for root in real_roots if x_min <= root <= x_max)

        return _path(points, "#24527a", 3) + markers

    return _svg_canvas((x_min, x_max), (y_min, y_max), draw, "Polynomial graph")


def styczna(xa, ya, xs, ys, r):
    eq = (a * (xs - xa) + ya - ys) ** 2 / (a**2 + 1) - r**2
    sols = sp.solve(eq, a)

    return tuple(slope * x + ya - slope * xa for slope in sols if _as_real_float(slope) is not None)


def styczna_plot(xa, ya, xs, ys, r, result):
    xa = float(xa)
    ya = float(ya)
    xs = float(xs)
    ys = float(ys)
    r = abs(float(r))
    x_min, x_max = _range_from_values([xa, xs - r, xs + r], min_span=max(4, 2 * r))
    y_min, y_max = _range_from_values([ya, ys - r, ys + r], min_span=max(4, 2 * r))

    slopes = []

    for function in result:
        slope = _as_real_float(sp.diff(function, x))

        if slope is not None:
            slopes.append(slope)

    def draw(sx, sy, x_scale, _y_scale, local_x_min, local_x_max, _local_y_min, _local_y_max):
        elements = [_circle(sx, sy, x_scale, xs, ys, r, "#24527a"), _point(sx(xa), sy(ya), "#111827", 5)]

        for index, slope in enumerate(slopes):
            intercept = ya - slope * xa
            color = "#2f6b36" if index == 0 else "#b45309"
            elements.append(_path(_line_points_for_slope(slope, intercept, local_x_min, local_x_max, sx, sy), color, 2.5))

        return "".join(elements)

    return _svg_canvas((x_min, x_max), (y_min, y_max), draw, "Tangents to circle", equal_aspect=True)


def line_and_circle(A, B, C, p, q, r):
    eq1 = A * x + B * y + C
    eq2 = (x - p) ** 2 + (y - q) ** 2 - r**2

    return sp.solve([eq1, eq2], [x, y])


def line_and_circle_plot(A, B, C, p, q, r, result):
    A = float(A)
    B = float(B)
    C = float(C)
    p = float(p)
    q = float(q)
    r = abs(float(r))
    points = _solution_points(result)
    point_xs = [point[0] for point in points]
    point_ys = [point[1] for point in points]
    line_xs = []
    line_ys = []

    if abs(B) > 1e-12:
        for value_x in (p - r, p + r):
            line_xs.append(value_x)
            line_ys.append((-A * value_x - C) / B)
    elif abs(A) > 1e-12:
        line_xs.append(-C / A)

    x_min, x_max = _range_from_values([p - r, p + r] + point_xs + line_xs, min_span=max(4, 2 * r))
    y_min, y_max = _range_from_values([q - r, q + r] + point_ys + line_ys, min_span=max(4, 2 * r))

    def draw(sx, sy, x_scale, _y_scale, local_x_min, local_x_max, local_y_min, local_y_max):
        elements = [_circle(sx, sy, x_scale, p, q, r, "#24527a")]

        if abs(B) > 1e-12:
            slope = -A / B
            intercept = -C / B
            line_points = _line_points_for_slope(slope, intercept, local_x_min, local_x_max, sx, sy)
        elif abs(A) > 1e-12:
            line_x = -C / A
            line_points = [(sx(line_x), sy(local_y_min)), (sx(line_x), sy(local_y_max))]
        else:
            line_points = []

        if line_points:
            elements.append(_path(line_points, "#2f6b36", 2.5))

        elements.extend(_point(sx(point_x), sy(point_y), "#b45309", 5) for point_x, point_y in points)

        return "".join(elements)

    return _svg_canvas((x_min, x_max), (y_min, y_max), draw, "Line and circle graph", equal_aspect=True)


def two_circles(a1, b1, r1, a2, b2, r2):
    eq1 = (x - a1) ** 2 + (y - b1) ** 2 - r1**2
    eq2 = (x - a2) ** 2 + (y - b2) ** 2 - r2**2

    return sp.solve([eq1, eq2], [x, y])


def two_circles_plot(a1, b1, r1, a2, b2, r2, result):
    a1 = float(a1)
    b1 = float(b1)
    r1 = abs(float(r1))
    a2 = float(a2)
    b2 = float(b2)
    r2 = abs(float(r2))
    points = _solution_points(result)
    point_xs = [point[0] for point in points]
    point_ys = [point[1] for point in points]
    x_min, x_max = _range_from_values([a1 - r1, a1 + r1, a2 - r2, a2 + r2] + point_xs, min_span=max(4, 2 * max(r1, r2)))
    y_min, y_max = _range_from_values([b1 - r1, b1 + r1, b2 - r2, b2 + r2] + point_ys, min_span=max(4, 2 * max(r1, r2)))

    def draw(sx, sy, x_scale, _y_scale, _local_x_min, _local_x_max, _local_y_min, _local_y_max):
        elements = [
            _circle(sx, sy, x_scale, a1, b1, r1, "#24527a"),
            _circle(sx, sy, x_scale, a2, b2, r2, "#2f6b36"),
        ]
        elements.extend(_point(sx(point_x), sy(point_y), "#b45309", 5) for point_x, point_y in points)

        return "".join(elements)

    return _svg_canvas((x_min, x_max), (y_min, y_max), draw, "Two circles graph", equal_aspect=True)


def lines_angle(a1, a2):
    if 1 + a1 * a2 == 0:
        return 90

    tangent = abs((a1 - a2) / (1 + a1 * a2))
    angle = sp.atan(tangent) * 180 / sp.pi

    return round(float(angle), 2)


def lines_angle_plot(a1, a2):
    a1 = float(a1)
    a2 = float(a2)
    x_min, x_max = -5, 5
    y_min, y_max = _range_from_values([a1 * x_min, a1 * x_max, a2 * x_min, a2 * x_max, 0], min_span=6)

    def draw(sx, sy, _x_scale, _y_scale, local_x_min, local_x_max, _local_y_min, _local_y_max):
        elements = [
            _path(_line_points_for_slope(a1, 0, local_x_min, local_x_max, sx, sy), "#24527a", 2.5),
            _path(_line_points_for_slope(a2, 0, local_x_min, local_x_max, sx, sy), "#2f6b36", 2.5),
        ]
        theta1 = math.atan(a1)
        theta2 = math.atan(a2)
        difference = theta2 - theta1

        while difference > math.pi / 2:
            difference -= math.pi

        while difference < -math.pi / 2:
            difference += math.pi

        steps = 24
        radius = min(x_max - x_min, y_max - y_min) * 0.16
        arc = []

        for index in range(steps + 1):
            theta = theta1 + difference * index / steps
            arc.append((sx(radius * math.cos(theta)), sy(radius * math.sin(theta))))

        elements.append(_path(arc, "#b45309", 3))

        return "".join(elements)

    return _svg_canvas((x_min, x_max), (y_min, y_max), draw, "Angle between lines graph")
