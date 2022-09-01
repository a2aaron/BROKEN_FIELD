use std::convert::Infallible;

use serde::Deserialize;
use sqlx::{pool::PoolConnection, Sqlite, SqlitePool};
use warp::{
    hyper::{StatusCode, Uri},
    reject::Reject,
    Filter, Rejection, Reply,
};

struct CouldntConnect(sqlx::Error);
impl std::fmt::Debug for CouldntConnect {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Couldn't connect to the database: {}", self.0)
    }
}
impl Reject for CouldntConnect {}

struct QueryError(sqlx::Error);
impl std::fmt::Debug for QueryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Error in running query: {}", self.0)
    }
}
impl Reject for QueryError {}

#[derive(Deserialize)]
struct URLParams {
    url: String,
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = SqlitePool::connect("example.db").await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS shortened_url
                (short_url TEXT NOT NULL UNIQUE, long_url TEXT NOT NULL UNIQUE)",
    )
    .execute(&pool)
    .await?;

    println!("nya");
    let home_page_redirect = warp::filters::method::get()
        .and(warp::path("BROKEN_FIELD"))
        .and(warp::path::end())
        .map(|| {
            warp::redirect::temporary(Uri::from_static("https://a2aaron.github.io/BROKEN_FIELD/"))
        });

    let redirect = warp::filters::method::get()
        .and(warp::path("BROKEN_FIELD"))
        .and(warp::path::param())
        .and(warp::path::end())
        .and(with_db(pool.clone()))
        .and_then(|id: String, pool: SqlitePool| async move {
            let mut conn = pool
                .acquire()
                .await
                .map_err(|err| warp::reject::custom(CouldntConnect(err)))?;

            if let Some(query) = id_to_query_params(&id, &mut conn).await {
                let path = format!("https://a2aaron.github.io/BROKEN_FIELD/?{}", query);
                let uri = path.parse::<Uri>().unwrap();
                // Note: this should be a permenant redirect in the actual live site.
                Result::<_, Rejection>::Ok(warp::redirect::temporary(uri))
            } else {
                println!("Not found");
                Err(warp::reject::not_found())
            }
        });

    let create = warp::filters::method::post()
        .and(warp::path("BROKEN_FIELD"))
        .and(warp::path::end())
        .and(warp::filters::body::json())
        .and(with_db(pool.clone()))
        .and_then(|json: URLParams, pool: SqlitePool| async move {
            let mut conn = pool
                .acquire()
                .await
                .map_err(|err| warp::reject::custom(CouldntConnect(err)))?;

            let id = new_id();

            sqlx::query("INSERT OR IGNORE INTO shortened_url VALUES (?, ?)")
                .bind(&id)
                .bind(&json.url)
                .execute(&mut conn)
                .await
                .map_err(|err| warp::reject::custom(QueryError(err)))?;

            Result::<_, Rejection>::Ok(warp::reply::json(
                &query_params_to_id(&json.url, &mut conn).await,
            ))
        });

    let routes = create.or(redirect.or(home_page_redirect).recover(handle_rejection));

    warp::serve(routes).run(([127, 0, 0, 1], 3030)).await;

    Ok(())
}

async fn query_params_to_id(url: &str, conn: &mut PoolConnection<Sqlite>) -> String {
    let (id,) = sqlx::query_as("SELECT short_url FROM shortened_url WHERE long_url = ?")
        .bind(&url)
        .fetch_one(conn)
        .await
        .unwrap();
    return id;
}

fn new_id() -> String {
    random_string::generate(
        12,
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    )
}

async fn id_to_query_params(id: &str, conn: &mut PoolConnection<Sqlite>) -> Option<String> {
    sqlx::query_as("SELECT long_url FROM shortened_url WHERE short_url = ?")
        .bind(&id)
        .fetch_optional(conn)
        .await
        .unwrap()
        .map(|(x,)| x)
}

fn with_db(
    db_pool: SqlitePool,
) -> impl Filter<Extract = (SqlitePool,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || db_pool.clone())
}

// This function receives a `Rejection` and tries to return a custom
// value, otherwise simply passes the rejection along.
async fn handle_rejection(err: Rejection) -> Result<impl Reply, Infallible> {
    println!("{:?}", err);
    let code;
    let message;

    if err.is_not_found() {
        code = StatusCode::NOT_FOUND;
        message = "The shortened URL could not be found.";
    } else if let Some(_) = err.find::<warp::reject::MethodNotAllowed>() {
        // We can handle a specific error, here METHOD_NOT_ALLOWED,
        // and render it however we want
        code = StatusCode::METHOD_NOT_ALLOWED;
        message = "The method is not allowed.";
    } else {
        // We should have expected this... Just log and say its a 500
        eprintln!("unhandled rejection: {:?}", err);
        code = StatusCode::INTERNAL_SERVER_ERROR;
        message = "Some other error occured.";
    }

    Ok(warp::reply::with_status(message, code))
}
