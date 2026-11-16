//! CLI binary alias `ro` (`romi`).

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  webagent::run_cli().await
}
