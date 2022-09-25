import {sparqlEscapeUri, sparqlEscapeString} from 'mu';
import {querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';

export async function storeMollieApiKey(sellerWebId, apiKey) {
    const queryDelete = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE { GRAPH <http://mu.semte.ch/application> {
        ${sparqlEscapeUri(sellerWebId)} ext:mollieApiKey ?mollieApiKey.
    } }
    WHERE {
        ${sparqlEscapeUri(sellerWebId)} ext:mollieApiKey ?mollieApiKey.
    }`;

    const queryInsert = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT DATA { GRAPH <http://mu.semte.ch/application> {
        ${sparqlEscapeUri(sellerWebId)} ext:mollieApiKey ${sparqlEscapeString(apiKey)}.
    } }`;

    await update(queryDelete);
    return await update(queryInsert);
}

export async function getMollieApiKey(sellerWebId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?mollieApiKey
    FROM <http://mu.semte.ch/application>
    WHERE {
        ${sparqlEscapeUri(sellerWebId)} ext:mollieApiKey ?mollieApiKey.
    }`;

    return query(queryQuery);
}
