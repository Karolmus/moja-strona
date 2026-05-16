import sympy as sp

x, y, a = sp.symbols("x y a")


def bernoulli(p, n, k_values):
    q = 1 - p
    total = 0

    for i in range(n + 1):
        prob = sp.binomial(n, i) * p**i * q ** (n - i)

        if i in k_values:
            total += prob

    return total


def poly_solve(coeffs):
    coeffs = [0] * (5 - len(coeffs)) + coeffs
    f = coeffs[-5] * x**4 + coeffs[-4] * x**3 + coeffs[-3] * x**2 + coeffs[-2] * x + coeffs[-1]

    return sp.solve(f, x), sp.factor(f)


def styczna(xa, ya, xs, ys, r):
    eq = (a * (xs - xa) + ya - ys) ** 2 / (a**2 + 1) - r**2
    sols = sp.solve(eq, a)

    if len(sols) < 2:
        return sols

    f1 = sols[0] * x + ya - sols[0] * xa
    f2 = sols[1] * x + ya - sols[1] * xa

    return f1, f2


def line_and_circle(A, B, C, p, q, r):
    eq1 = A * x + B * y + C
    eq2 = (x - p) ** 2 + (y - q) ** 2 - r**2

    return sp.solve([eq1, eq2], [x, y])


def two_circles(a1, b1, r1, a2, b2, r2):
    eq1 = (x - a1) ** 2 + (y - b1) ** 2 - r1**2
    eq2 = (x - a2) ** 2 + (y - b2) ** 2 - r2**2

    return sp.solve([eq1, eq2], [x, y])


def lines_angle(a1, a2):
    if 1 + a1 * a2 == 0:
        return 90

    tangent = abs((a1 - a2) / (1 + a1 * a2))
    angle = sp.atan(tangent) * 180 / sp.pi

    return round(float(angle), 2)
