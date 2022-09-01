use serde::Deserialize;
use sqlx::{pool::PoolConnection, Sqlite, SqlitePool};
use warp::{hyper::Uri, reject::Reject, Filter, Rejection};

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
        .map(|| {
            warp::redirect::temporary(Uri::from_static("https://a2aaron.github.io/BROKEN_FIELD/"))
        });

    let redirect = warp::filters::method::get()
        .and(warp::path("BROKEN_FIELD"))
        .and(warp::path::param())
        .and(with_db(pool.clone()))
        .and_then(|id: String, pool: SqlitePool| async move {
            let conn = pool
                .acquire()
                .await
                .map_err(|err| warp::reject::custom(CouldntConnect(err)))?;

            let query = id_to_query_params(conn, id);
            let path = format!("https://a2aaron.github.io/BROKEN_FIELD/?{}", query);
            let uri = path.parse::<Uri>().unwrap();
            // Note: this should be a permenant redirect in the actual live site.
            Result::<_, Rejection>::Ok(warp::redirect::temporary(uri))
        });

    let create = warp::filters::method::post()
        .and(warp::path("BROKEN_FIELD"))
        .and(warp::filters::body::json())
        .and(with_db(pool.clone()))
        .and_then(|json: URLParams, pool: SqlitePool| async move {
            let mut conn = pool
                .acquire()
                .await
                .map_err(|err| warp::reject::custom(CouldntConnect(err)))?;

            let id = new_id();

            sqlx::query("INSERT INTO shortened_url VALUES (?, ?)")
                .bind(&id)
                .bind(&json.url)
                .execute(&mut conn)
                .await
                .map_err(|err| warp::reject::custom(QueryError(err)))?;

            Result::<_, Rejection>::Ok(warp::reply::json(&id))
        });

    warp::serve(home_page_redirect.or(redirect).or(create))
        .run(([127, 0, 0, 1], 3030))
        .await;

    Ok(())
}

fn new_id() -> String {
    return random_string::generate(
        12,
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    );
}

fn id_to_query_params(conn: PoolConnection<Sqlite>, id: String) -> String {
    return "bytebeat=dA%3D%3D&color=FFFFFF".to_string();
}

fn with_db(
    db_pool: SqlitePool,
) -> impl Filter<Extract = (SqlitePool,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || db_pool.clone())
}
