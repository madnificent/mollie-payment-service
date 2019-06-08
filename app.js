// see https://github.com/mu-semtech/mu-javascript-template for more info

import { app, query, errorHandler } from 'mu';
import assert from 'assert';
import mollieConstructor from '@mollie/api-client';

const MOLLIE_API_KEY = "YOUR MOLLIE API KEY";
const MOLLIE_REDIRECT_URL = "http://link-to-redirect-app-site/";
const MOLLIE_BASE_WEBHOOK_URL = "http://link-to-payment-service-webhook-call/";

const asyncMiddleware = fn =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch(next);
  };

function makeMollieClient() {
  return mollieConstructor({ apiKey: MOLLIE_API_KEY });
}

app.post('/payments', asyncMiddleware( function( req, res, next ) {
  const { type, attributes } = req.body.data;
  assert.equal( type, "payments" );
  const { amount, description } = attributes;

  const client = makeMollieClient();

  const redirectUrl = attributes.redirectUrl || MOLLIE_REDIRECT_URL;

  return client.payments.create({
    amount: {
      value:    amount,
      currency: 'EUR'
    },
    description, redirectUrl,
    webhookUrl:  MOLLIE_BASE_WEBHOOK_URL,
    // method: ["applepay","bancontact","banktransfer","belfius","creditcard","directdebit","ideal","inghomepay","kbc","paypal"]
  })
    .then((payment) => {
      res
        .status( 201 )
        .send( JSON.stringify( {
          data: {
            type: "payments",
            attributes: {
              paymentUrl: payment.getPaymentUrl(),

            }
          }
        } ) );
    })
    .catch((err) => {
      // Handle the error
      next( err );
    });
} ) );

app.post('webhook', function( req, res ) {
  console.log("Received webhook trigger");
  console.log(res.body);
} );


app.get('', function( req, res ) {
  res.send('Hello mu-javascript-template');
} );


app.use( errorHandler );
