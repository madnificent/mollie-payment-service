// see https://github.com/mu-semtech/mu-javascript-template for more info

import { app, query, errorHandler } from 'mu';
import assert from 'assert';
import mollieConstructor from '@mollie/api-client';

const MOLLIE_API_KEY = "YOUR MOLLIE API KEY";
const MOLLIE_REDIRECT_URL = "http://link-to-redirect-app-site/";
const MOLLIE_BASE_WEBHOOK_URL = "http://link-to-payment-service-webhook-call/";

const asyncMiddleware = fn =>
  (req, res, next) => {
    Promise
      .resolve(fn(req, res, next))
      .catch(next);
  };

function makeMollieClient() {
  return mollieConstructor({ apiKey: MOLLIE_API_KEY });
}

app.post('/payments', asyncMiddleware( async function( req, res, next ) {
  const { type, attributes } = req.body.data;
  assert.equal( type, "payments" );
  const { description } = attributes;

  const amount = await getAmountFromSession(req);

  const client = makeMollieClient();

  const redirectUrl = attributes.redirectUrl || MOLLIE_REDIRECT_URL;

  const payment = await client.payments.create({
    amount: {
      value:   amount.toFixed(2),
      currency: 'EUR'
    },
    description, redirectUrl,
    webhookUrl:  MOLLIE_BASE_WEBHOOK_URL,
    // method: ["applepay","bancontact","banktransfer","belfius","creditcard","directdebit","ideal","inghomepay","kbc","paypal"]
  });

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
} ) );

app.post('webhook', function( req, res ) {
  console.log("Received webhook trigger");
  console.log(res.body);
} );


app.get('', function( req, res ) {
  res.send('Hello mu-javascript-template');
} );


app.use( errorHandler );


async function getAmountFromSession(req){
  const sessionUri = req.get('mu-session-id');

  const queryString = `PREFIX veeakker: <http://veeakker.be/vocabularies/shop/>
    PREFIX gr: <http://purl.org/goodrelations/v1#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT * WHERE {
      GRAPH <http://mu.semte.ch/application> {
        ${sparqlEscapeUri(sessionUri)} veeakker:hasBasket ?basket.
        ?basket veeakker:orderLine ?orderLine.

        ?orderLine veeakker:amount ?amount.
        ?orderLine veeakker:hasOffering/gr:hasPriceSpecification ?priceSpec.
        ?priceSpec gr:hasUnitOfMeasurement "C62";
                   gr:hasCurrencyValue ?value.
      }
    }`;

  // TODO: cope with different types of measurements
  const response = await query( queryString );

  const reducer = function( acc, obj ) {
    console.log(`Adding object ${JSON.stringify( obj )}`);
    const { amount, value } = obj;
    return parseFloat( value.value ) * parseInt( amount.value );
  };

  const result = response.results.bindings.reduce( reducer, 0 );

  return result;
}
