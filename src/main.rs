//! Main binary executable entrypoint for `webagent`.

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  webagent::run_cli().await
}
