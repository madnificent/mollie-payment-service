# mollie payment service

This service provides an integration for the [Mollie](https://mollie.com) payment provider with [mu.semte.ch](http://mu.semte.ch).  Mollie handles payment transactions for web applications and has integrations with various providers.

## Use

In your docker-compose.yml

```yml
  payments:
    image: madnificent/mu-mollie-payment-service
    links:
      - db:database
    environment:
      MOLLIE_API_KEY: "your mollie api key"
      MOLLIE_REDIRECT_URL: "http://frontend/checkout/success"
      MOLLIE_BASE_WEBHOOK_URL: "http://frontend/payments/callback"
      BACKEND_CALLBACK_HOSTNAME: "backend"
      BACKEND_CALLBACK_PORT: "80"
      BACKEND_CALLBACK_PATH: "/buy/callback"
```

- `BACKEND_CALLBACK_HOSTNAME`: the name of the service acting as the backend of your application as in your `docker-compose.yml`. This backend callback allows you to further synchronize the payment info in the triple store with the backend.

In your dispatcher.ex

```elixir
  match "/payments/*path" do
    Proxy.forward conn, path, "http://payments/payments/"
  end
```

## Payments flow

Below, the payments flow and communication between this payment service and the different services is specified.
- **frontend -> backend** (*)
    - initiate order, send back `orderId`
- **frontend -> payment**
    - *location rewrite: user goes to payment service*
    - `POST /payments {orderId: "orderId"}`
    - send `orderId`, initiate payment, save payment info to triple store
- **payment -> mollie**
    - *location rewrite: user goes to Mollie checkout page to pay*
    - handle payment
    - uses environment variables `MOLLIE_API_KEY` (see below) (, `MOLLIE_REDIRECT_URL` and `MOLLIE_BASE_WEBHOOK_URL`)
- **mollie -> frontend**
    - *location rewrite: user goes back to application frontend*
    - go to redirect url
    - uses environment variable `MOLLIE_REDIRECT_URL`
- **mollie -> payment**
    - call callback url (sends `orderId`), update payment info in triple store (add `paymentId`, update `orderStatus`) by querying Mollie API
    - uses environment variable `MOLLIE_BASE_WEBHOOK_URL`
- **payment -> backend**
    - `POST /buy/callback JSON({paymentId: "paymentId"})`
    - query triple store and accordingly update backend (*)
    - uses environment variable `BACKEND_CALLBACK_HOSTNAME`, `BACKEND_CALLBACK_PORT` and `BACKEND_CALLBACK_PATH`

Notes:
- `(*)`: this is a suggestion on how it should be done, but it is open for adjustment.
- `frontend`: the name of the service acting as the frontend of your application as in your `docker-compose.yml`.
- `backend`: the name of the service acting as the backend of your application as in your `docker-compose.yml`.
- `payment`: this service.
- `mollie`: the Mollie API.

### Mollie API Key

You can specify the application's Mollie API key via the `MOLLIE_API_KEY` environment variable in the `docker-compose.yml` file.  
It will use this API key to handle payments if there is no Mollie API key specified for the seller in the triple store.  
However, specifying a Mollie API key for the seller in the triple store (`?sellerWebId ext:mollieApiKey ?mollieApiKey`) will override the default API key, letting the buyer directly pay to the seller.  

This user specific API key can also be configured using the `POST /key` endpoint with body `{apiKey: "your mollie api key", sellerWebId: "webId for which to configure the key"}`.

If you want to support this feature, make sure to add following to your `dispatcher.ex`

```elixir
  match "/key/*path" do
    Proxy.forward conn, path, "http://payments/key/"
  end
```

### Required triples in the triple store

This services uses the vocabulary `http://schema.org/` (`schema`) and `http://mu.semte.ch/vocabularies/ext/` (`ext`).

When receiving the `POST /payments` call, it assumes that at least following triples are at least in the triple store.
```
?order a schema:Order;
    schema:orderStatus <http://schema.org/OrderPaymentDue>;
    schema:acceptedOffer ?offer.
?offer a schema:Offer;
    schema:name ?offerName;
    schema:seller ?sellerWebId;
    schema:price ?offerPrice;
    schema:priceCurrency ?offerCurrency.
```

It will then insert following triple
```
?order schema:paymentMethodId "paymentId"
```

When receiving the `POST /payments/callback` call, it assumes that at least following triples are at least in the triple store.
```
?order a schema:Order;
    schema:paymentMethodId "paymentId";
    ext:sellerPod ?sellerPod;
    ext:buyerPod ?buyerPod;
    schema:seller ?seller.
```

It then will update the order status to the following triple
```
?order schema:orderStatus <http://schema.org/OrderDelivered>
```
