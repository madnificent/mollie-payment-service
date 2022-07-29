// see https://github.com/mu-semtech/mu-javascript-template for more info

import {app} from 'mu';
import {
    checkPayment, confirmPayment,
    getMollieApiKey,
    getOrderDetails,
    getPaymentInformationFromPaymentId,
    handlePayment, savePaymentId, sendBackendCallback
} from "./payments";

const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY;
const MOLLIE_REDIRECT_URL = process.env.MOLLIE_REDIRECT_URL;
const MOLLIE_BASE_WEBHOOK_URL = process.env.MOLLIE_BASE_WEBHOOK_URL;
const BACKEND_CALLBACK_HOSTNAME = process.env.BACKEND_CALLBACK_HOSTNAME;
const BACKEND_CALLBACK_PORT = process.env.BACKEND_CALLBACK_PORT;
const BACKEND_CALLBACK_PATH = process.env.BACKEND_CALLBACK_PATH;

app.post('/payments', async (req, res) => {
    const orderId = req.body.orderId;
    if (orderId === undefined) {
        res.status(400).send('Missing orderId');
        return;
    }

    const orderDetails = await getOrderDetails(orderId);
    if (!Array.isArray(orderDetails.results.bindings) || orderDetails.results.bindings.length === 0) {
        res.status(404).send('Order not found');
        return;
    }
    const sellerWebId = orderDetails.results.bindings[0].sellerWebId.value;
    const offerName = orderDetails.results.bindings[0].offerName.value;
    const price = orderDetails.results.bindings[0].offerPrice.value;
    const orderStatus = orderDetails.results.bindings[0].orderStatus.value;
    if (orderStatus !== 'http://schema.org/OrderPaymentDue') {
        res.status(400).send('Order is not due for payment');
        return;
    }

    const mollieApiKeyQuery = await getMollieApiKey(sellerWebId);

    // Use the user specific API key of the seller if available. Otherwise, use the default API key of the application.
    let mollieApiKey = MOLLIE_API_KEY;
    if (Array.isArray(mollieApiKeyQuery.results.bindings) && mollieApiKeyQuery.results.bindings.length > 0) {
        mollieApiKey = mollieApiKeyQuery.results.bindings[0].mollieApiKey.value;
    }

    const payment = await handlePayment(offerName, price, mollieApiKey, MOLLIE_REDIRECT_URL, MOLLIE_BASE_WEBHOOK_URL);

    await savePaymentId(orderId, payment.id);

    res.redirect(payment.getCheckoutUrl());
});

app.post('/payments/callback', async (req, res) => {
    const paymentId = req.body.id;
    if (paymentId === undefined) {
        res.status(400).send('Missing payment id');
        return;
    }

    const paymentInformation = await getPaymentInformationFromPaymentId(paymentId);
    if (!Array.isArray(paymentInformation.results.bindings) || paymentInformation.results.bindings.length === 0) {
        throw new Error(`No payment information found for payment ID '${paymentId}'.`);
    }
    const buyerPod = paymentInformation.results.bindings[0].buyerPod.value;
    const sellerPod = paymentInformation.results.bindings[0].sellerPod.value;
    const sellerWebId = paymentInformation.results.bindings[0].seller.value;
    const orderId = paymentInformation.results.bindings[0].order.value;

    const mollieApiKeyQuery = await getMollieApiKey(sellerWebId);

    // Use the user specific API key of the seller if available. Otherwise, use the default API key of the application.
    let mollieApiKey = MOLLIE_API_KEY;
    if (Array.isArray(mollieApiKeyQuery.results.bindings) && mollieApiKeyQuery.results.bindings.length > 0) {
        mollieApiKey = mollieApiKeyQuery.results.bindings[0].mollieApiKey.value;
    }

    const isPaid = await checkPayment(paymentId, mollieApiKey);
    // Only paid statuses are handled for now.
    if (isPaid) {
        if (await confirmPayment(buyerPod, sellerPod, orderId)) {
            // Send a callback to the backend service to let them know that the payment information has been changed.
            sendBackendCallback(BACKEND_CALLBACK_HOSTNAME, BACKEND_CALLBACK_PORT, BACKEND_CALLBACK_PATH, paymentId);

            res.send('OK');
        } else {
            res.status(500).send('Payment confirmation failed');
        }
    } else {
        // For security reasons, we don't want to leak information about an unknown payment id.
        res.send('OK');
    }
});
