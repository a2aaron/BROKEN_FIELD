use num_complex::Complex;

// Return None if `point` remains within `escape_radius` distance of the origin
// after `max_iters` of iterations. Return Some(usize) if the point escapes,
// the usize is equal to the escape iteration
pub fn evaluate_mandelbrot(
    mut point: Complex<f64>,
    max_iters: usize,
    escape_radius: f64,
) -> Option<usize> {
    // This is equivalent to "c" in "z_n+1 = z_n ^ 2 + c"
    // `point` is equivalent to z_n
    let init_point = point;
    let mut iters = 0;
    loop {
        // Bailout -- reached max iterations
        if iters > max_iters {
            return None;
        }

        // Bailout -- point escaped the escape radius
        if point.norm_sqr() > escape_radius * escape_radius {
            return Some(iters);
        }

        point = point.powu(2) + init_point;
        iters += 1;
    }
}
