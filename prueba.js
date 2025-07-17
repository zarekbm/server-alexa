const Alexa = require('ask-sdk-core');
const axios = require('axios');

const WEB_APP_URL = process.env.https://script.google.com/macros/s/AKfycbznGAcPL7DaiDPa31Y2t6rSA21O_zWu-pKJ9iRtZrz4fSqmBts2c9mL8ZV6Y6wS04EU7Q/exec;

// Helper para formatear fechas
function formatDate(dateStr) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateStr).toLocaleDateString('es-ES', options);
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speechText = 'Bienvenido a tu inventario de medicamentos. Puedes consultar medicamentos, registrar tomas o revisar alertas. ¿Qué necesitas?';
    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  }
};

const ConsultarMedicamentoHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarMedicamento';
  },
  async handle(handlerInput) {
    const medicamento = handlerInput.requestEnvelope.request.intent.slots.medicamento.value;
    
    try {
      const response = await axios.post(WEB_APP_URL, {
        action: 'consultar',
        medicamento: medicamento
      });
      
      const data = response.data;
      
      if (!data.encontrado) {
        return handlerInput.responseBuilder
          .speak(`No encontré ${medicamento} en el inventario.`)
          .getResponse();
      }
      
      let speechText = `Tienes ${data.cantidad} unidades de ${data.nombre}. `;
      speechText += `Presentación: ${data.presentacion} de ${data.concentracion}. `;
      speechText += `Ubicación: ${data.ubicacion}. `;
      
      if (data.estado.includes('VENCIDO')) {
        speechText += '¡ATENCIÓN! Este medicamento está vencido. ';
      } else if (data.estado.includes('POR VENCER')) {
        speechText += `Vence en ${data.diasParaVencer} días. `;
      }
      
      if (data.cantidad < data.cantidadMinima) {
        speechText += `¡Alerta! Stock bajo (mínimo recomendado: ${data.cantidadMinima}). `;
      }
      
      speechText += `Indicaciones: ${data.indicaciones}. Posología: ${data.posologia}.`;
      
      return handlerInput.responseBuilder
        .speak(speechText)
        .withSimpleCard(data.nombre, 
          `Cantidad: ${data.cantidad}\n` +
          `Ubicación: ${data.ubicacion}\n` +
          `Estado: ${data.estado}\n` +
          `Vencimiento: ${formatDate(data.vencimiento)}\n` +
          `Indicaciones: ${data.indicaciones}`)
        .getResponse();
    } catch (error) {
      console.error('Error:', error);
      return handlerInput.responseBuilder
        .speak('Hubo un problema al consultar el medicamento. Por favor, inténtalo de nuevo.')
        .getResponse();
    }
  }
};

const RegistrarTomaHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RegistrarToma';
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.medicamento = handlerInput.requestEnvelope.request.intent.slots.medicamento.value;
    
    // Guardar medicamento en sesión y delegar a ConfirmarCantidad
    return handlerInput.responseBuilder
      .addDelegateDirective({
        name: 'ConfirmarCantidad',
        confirmationStatus: 'NONE',
        slots: {}
      })
      .getResponse();
  }
};

const ConfirmarCantidadHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConfirmarCantidad';
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const cantidad = handlerInput.requestEnvelope.request.intent.slots.cantidad.value;
    
    if (!sessionAttributes.medicamento) {
      return handlerInput.responseBuilder
        .speak('No se especificó qué medicamento se tomó. Por favor, comienza de nuevo.')
        .getResponse();
    }
    
    try {
      const response = await axios.post(WEB_APP_URL, {
        action: 'registrar_toma',
        medicamento: sessionAttributes.medicamento,
        cantidad: cantidad,
        usuario: 'Usuario Alexa'
      });
      
      return handlerInput.responseBuilder
        .speak(response.data.message)
        .withSimpleCard('Toma registrada', 
          `Medicamento: ${sessionAttributes.medicamento}\n` +
          `Cantidad tomada: ${cantidad}\n` +
          `Stock restante: ${response.data.cantidadRestante}`)
        .getResponse();
    } catch (error) {
      console.error('Error:', error);
      let speechText = 'No pude registrar la toma. ';
      
      if (error.response && error.response.data && error.response.data.message) {
        speechText += error.response.data.message;
      } else {
        speechText += 'Por favor, inténtalo de nuevo.';
      }
      
      return handlerInput.responseBuilder
        .speak(speechText)
        .getResponse();
    }
  }
};

const ConsultarAlertasHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarAlertas';
  },
  async handle(handlerInput) {
    try {
      const response = await axios.post(WEB_APP_URL, {
        action: 'consultar_alertas'
      });
      
      const data = response.data;
      
      if (data.total === 0) {
        return handlerInput.responseBuilder
          .speak('No hay alertas activas en tu inventario de medicamentos.')
          .getResponse();
      }
      
      let speechText = `Tienes ${data.total} alertas: `;
      let cardContent = 'Alertas activas:\n\n';
      
      data.alertas.forEach((alerta, index) => {
        speechText += `${index + 1}. ${alerta.medicamento}: ${alerta.detalle}. `;
        cardContent += `• ${alerta.medicamento}: ${alerta.detalle}\n`;
        cardContent += `  [${alerta.tipo}] ${alerta.accion}\n\n`;
      });
      
      return handlerInput.responseBuilder
        .speak(speechText)
        .withSimpleCard('Alertas de Medicamentos', cardContent)
        .getResponse();
    } catch (error) {
      console.error('Error:', error);
      return handlerInput.responseBuilder
        .speak('Hubo un problema al consultar las alertas. Por favor, inténtalo de nuevo.')
        .getResponse();
    }
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Error:', error);
    return handlerInput.responseBuilder
      .speak('Lo siento, no pude procesar tu solicitud. Por favor, inténtalo de nuevo.')
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    ConsultarMedicamentoHandler,
    RegistrarTomaHandler,
    ConfirmarCantidadHandler,
    ConsultarAlertasHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
