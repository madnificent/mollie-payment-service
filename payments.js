import {querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import createMollieClient from "@mollie/api-client";
import http from "http";

export async function getPaymentInformationFromPaymentId(paymentId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX schema: <http://schema.org/>
    SELECT ?buyerPod ?sellerPod ?order ?seller
    FROM <http://mu.semte.ch/application>
    WHERE {
        ?order a schema:Order;
            schema:paymentMethodId "${paymentId}";
            ext:sellerPod ?sellerPod;
            ext:buyerPod ?buyerPod;
            schema:seller ?seller.
    }`;

    return query(queryQuery);
}

export async function checkPayment(paymentId, apiKey) {
    const mollieClient = createMollieClient({apiKey: apiKey});

    const payment = await mollieClient.payments.get(paymentId);
    return (payment?.status === 'paid');
}

export async function savePaymentId(orderId, paymentId) {
    const storeQuery = `
    PREFIX schema: <http://schema.org/>
    INSERT DATA { GRAPH <http://mu.semte.ch/application> {
        <${orderId}> schema:paymentMethodId "${paymentId}".
    } }`;

    return update(storeQuery);
}

export async function getOrderDetails(orderId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX schema: <http://schema.org/>
    SELECT ?orderStatus ?offerName ?offerPrice ?offerCurrency ?sellerWebId
    FROM <http://mu.semte.ch/application>
    WHERE {
        <${orderId}> a schema:Order;
            schema:orderStatus ?orderStatus;
            schema:acceptedOffer ?offer.
        ?offer a schema:Offer;
            schema:name ?offerName;
            schema:seller ?sellerWebId;
            schema:price ?offerPrice;
            schema:priceCurrency ?offerCurrency.
    }`;

    return query(queryQuery);
}

export async function handlePayment(offeringName, price, mollieApiKey, mollieRedirectUrl, mollieBaseWebhookUrl) {
    const mollieClient = createMollieClient({apiKey: mollieApiKey});

    return await mollieClient.payments.create({
        amount: {
            value: Number(price).toFixed(2),
            currency: 'EUR'
        },
        description: `Payment for ${offeringName} via The Solid Shop.`,
        redirectUrl: mollieRedirectUrl,
        webhookUrl: mollieBaseWebhookUrl
    });
}

export async function confirmPayment(buyerPod, sellerPod, orderUUID) {
    const deleteQuery = `
    PREFIX schema: <http://schema.org/>
    DELETE DATA { GRAPH <http://mu.semte.ch/application> {
        <${orderUUID}> schema:orderStatus <http://schema.org/OrderPaymentDue>.
    } }`;

    const insertQuery = `
    PREFIX schema: <http://schema.org/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT DATA { GRAPH <http://mu.semte.ch/application> {
        <${orderUUID}> schema:orderStatus <http://schema.org/OrderDelivered>.
    } }`;

    try {
        await update(deleteQuery);
        await update(insertQuery);
    } catch (e) {
        console.error(e);
        return false;
    }

    return true;
}

export function sendBackendCallback(backendCallbackHostname, backendCallbackPort, backendCallbackPath, paymentId) {
    const data = JSON.stringify({
        paymentId: paymentId
    });

    const options = {
        method: 'POST',
        port: backendCallbackPort,
        hostname: backendCallbackHostname,
        path: backendCallbackPath,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
        },
    }

    const req = http.request(options, () => {});
    req.on('error', error => {
        console.error(error);
    });
    req.write(data);
    req.end();
}
