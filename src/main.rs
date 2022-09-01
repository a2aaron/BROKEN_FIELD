use warp::{hyper::Uri, Filter, Reply};

#[tokio::main]
async fn main() {
    let filter = warp::path("BROKEN_FIELD")
        .and(warp::path::param())
        .and(warp::header::optional("user-agent"))
        .map(|param: i32, user_agent: Option<String>| -> Box<dyn Reply> {
            if param == 69 {
                Box::new(warp::redirect(Uri::from_static(
                    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                )))
            } else {
                let html = include_str!("website.html");
                let html = warp::reply::html(html);
                Box::new(html)
            }
        });

    warp::serve(filter).run(([127, 0, 0, 1], 3030)).await;
}
