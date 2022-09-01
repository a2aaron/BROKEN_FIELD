use std::collections::HashMap;

use warp::{hyper::Uri, Filter};

#[tokio::main]
async fn main() {
    let redirect = warp::filters::method::get()
        .and(warp::path("BROKEN_FIELD"))
        .and(warp::path::param())
        .map(|id: String| {
            let query = id_to_query_params(id);
            let path = format!("https://a2aaron.github.io/BROKEN_FIELD/?{}", query);
            let uri = path.parse::<Uri>().unwrap();
            warp::redirect(uri)
        });

    let create = warp::filters::method::post()
        .and(warp::path("BROKEN_FIELD"))
        .and(warp::filters::body::json())
        .map(|json: HashMap<String, String>| warp::reply());

    warp::serve(redirect.or(create))
        .run(([127, 0, 0, 1], 3030))
        .await;
}

fn id_to_query_params(id: String) -> String {
    return "bytebeat=dA%3D%3D&color=ffb9d2".to_string();
}
