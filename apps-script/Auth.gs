/**
 * Autenticación y verificación de tokens Firebase JWT.
 *
 * Verifica el ID token de Firebase llamando a la API oficial
 * accounts:lookup de Firebase Identity Toolkit. Google valida
 * el token en el servidor (firma, expiración, proyecto) y
 * devuelve los datos del usuario si es válido.
 *
 * Devuelve { ok: true, user } o { ok: false, reason } para que
 * el llamador pueda responder el motivo sin depender de variables
 * globales compartidas entre archivos.
 */

function verifyFirebaseToken(token) {
  var detail = '';
  try {
    var parts = String(token).split('.');
    if (parts.length !== 3) {
      detail = 'STAGE:parts -> no tiene 3 partes';
      return { ok: false, reason: detail };
    }

    var payloadJson = base64UrlDecode(parts[1]);
    detail = 'STAGE:decode -> ' + payloadJson.substring(0, 30);
    var payload = JSON.parse(payloadJson);
    detail = 'STAGE:json -> OK';

    var now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      detail = 'STAGE:exp -> Token expirado';
      return { ok: false, reason: detail };
    }

    var expectedIss = 'https://securetoken.google.com/' + CONFIG.FIREBASE_PROJECT_ID;
    if (payload.iss !== expectedIss) {
      detail = 'STAGE:iss -> incorrecto: ' + payload.iss;
      return { ok: false, reason: detail };
    }

    if (payload.aud !== CONFIG.FIREBASE_PROJECT_ID &&
        payload.aud !== CONFIG.FIREBASE_API_KEY) {
      detail = 'STAGE:aud -> incorrecto: ' + payload.aud;
      return { ok: false, reason: detail };
    }

    detail = 'STAGE:lookup -> consultando';
    var verified = verifyTokenWithFirebase(token);
    if (!verified || !verified.ok) {
      detail = 'STAGE:lookup -> ' + ((verified && verified.reason) || 'fallo');
      return { ok: false, reason: detail };
    }

    return {
      ok: true,
      user: {
        uid: verified.user.uid,
        email: verified.user.email,
        emailVerified: verified.user.emailVerified,
        name: verified.user.name || verified.user.email,
        role: getUserRole(verified.user.uid)
      }
    };

  } catch (err) {
    detail = 'STAGE:excepcion -> ' + err.message;
    Logger.log('Error verificando token: ' + err.message);
    return { ok: false, reason: detail };
  }
}

function base64UrlDecode(str) {
  var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  var blob = Utilities.newBlob(Utilities.base64Decode(b64));
  return blob.getDataAsString('UTF-8');
}

/**
 * Valida el token con la API oficial de Firebase (accounts:lookup).
 * Google verifica la firma y devuelve 200 solo si el token es válido
 * y pertenece al proyecto del API key.
 */
function verifyTokenWithFirebase(token) {
  try {
    var url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + CONFIG.FIREBASE_API_KEY;
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: token }),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      var u = data.users && data.users[0];
      if (u) {
        return {
          ok: true,
          user: {
            uid: u.localId,
            email: u.email,
            emailVerified: u.emailVerified,
            name: u.displayName || u.email
          }
        };
      }
      return { ok: false, reason: 'lookup users vacio' };
    }

    return { ok: false, reason: 'lookup HTTP ' + response.getResponseCode() + ': ' + response.getContentText() };
  } catch (err) {
    Logger.log('Error en verifyTokenWithFirebase: ' + err.message);
    return { ok: false, reason: 'lookup error: ' + err.message };
  }
}

function getUserRole(uid) {
  try {
    return CONFIG.ROLES.ADMIN;
  } catch (err) {
    Logger.log('Error obteniendo rol: ' + err.message);
    return CONFIG.ROLES.USER;
  }
}