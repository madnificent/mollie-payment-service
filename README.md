# mollie payment service

This service provides an integration for the [Mollie](https://mollie.com) payment provider with [mu.semte.ch](http://mu.semte.ch).  Mollie handles payment transactions for web applications and has integrations with various providers.

Current implementation is dependent on the model for payments as built for the veeakker webshop.  The current flow may be changed to further abstract this service and ensure it can be used in more contexts.  For now, the integration is geared towards that specific webshop.

## Use

In your docker-compose.yml

```yml
  payments:
    image: madnificent/mu-mollie-payment-service
    links:
      - db:database
    environment:
      MOLLIE_API_KEY: "your mollie api key"
      MOLLIE_REDIRECT_URL: "http://frontend/paymentRedirect"
      MOLLIE_BASE_WEBHOOK_URL: "http://backend/paymentWebhook"
```

In your dispatcher.ex

```elixir
  match "/payments/*path" do
    Proxy.forward conn, path, "http://payments/payments/"
  end

  match "/paymentWebhook/*path" do
    Proxy.forward conn, path, "http://payments/webhook/"
  end
```
