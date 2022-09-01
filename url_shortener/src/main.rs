use std::collections::HashMap;

use warp::{hyper::Uri, Filter};

#[tokio::main]
async fn main() {
    let home_page_redirect = warp::filters::method::get()
        .and(warp::path("BROKEN_FIELD"))
        .map(|| {
            warp::redirect::temporary(Uri::from_static("https://a2aaron.github.io/BROKEN_FIELD/"))
        });

    let redirect = warp::filters::method::get()
        .and(warp::path("BROKEN_FIELD"))
        .and(warp::path::param())
        .map(|id: String| {
            let query = id_to_query_params(id);
            let path = format!("https://a2aaron.github.io/BROKEN_FIELD/?{}", query);
            let uri = path.parse::<Uri>().unwrap();
            // Note: this should be a permenant redirect in the actual live site.
            warp::redirect::temporary(uri)
        });

    let create = warp::filters::method::post()
        .and(warp::path("BROKEN_FIELD"))
        .and(warp::filters::body::json())
        .map(|json: HashMap<String, String>| warp::reply());

    warp::serve(home_page_redirect.or(redirect).or(create))
        .run(([127, 0, 0, 1], 3030))
        .await;
}

fn id_to_query_params(id: String) -> String {
    return "bytebeat=dA%3D%3D&color=FFFFFF".to_string();
}
