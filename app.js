// see https://github.com/mu-semtech/mu-javascript-template for more info

import { app, query, update, errorHandler, sparqlEscapeUri, sparqlEscapeString } from 'mu';
import assert from 'assert';
import mollieConstructor from '@mollie/api-client';
import bodyParser from 'body-parser';

const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY;
const MOLLIE_REDIRECT_URL = process.env.MOLLIE_REDIRECT_URL;
const MOLLIE_BASE_WEBHOOK_URL = process.env.MOLLIE_BASE_WEBHOOK_URL;

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
    metadata: { sessionId: req.get('mu-session-id') },
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

app.post('/webhook', async function( req, res ) {
  console.log("Received webhook trigger");
  console.log(JSON.stringify(req.headers));
  console.log(req.body);

  const paymentId = req.body.id;

  try {
    const client = makeMollieClient();
    const paymentInfo = await client.payments.get(paymentId);

    const sessionId = paymentInfo.metadata.sessionId;
    const paymentStatus = paymentInfo.status;

    // TODO: send with updated mu-session-id header
    const response = await update(`
      PREFIX veeakker: <http://veeakker.be/vocabularies/shop/>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

      WITH <http://mu.semte.ch/application>
      DELETE {
        ?basket veeakker:basketPaymentStatus ?paymentStatus.
      }
      INSERT {
        ?basket veeakker:basketPaymentStatus ${sparqlEscapeString(paymentStatus)}.
      }
      WHERE {
        ${sparqlEscapeUri(sessionId)} veeakker:hasBasket ?basket.
        OPTIONAL { ?basket veeakker:basketPaymentStatus ?paymentStatus. }
      }
    `);

    // TODO: cope with erroneous responses from Mollie
  } catch (err) {
    console.log(err);
  }
  res.send("Success");
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
