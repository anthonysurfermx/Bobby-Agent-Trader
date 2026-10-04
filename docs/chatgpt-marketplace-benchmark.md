# Bobby: benchmark de integraciones financieras en ChatGPT

Fecha de consulta: 4 de octubre de 2026. Se revisaron fichas públicas del directorio y documentación oficial; no se instalaron competidores ni se probaron cuentas financieras reales. Las capacidades son las declaradas por sus desarrolladores. La disponibilidad y los precios pueden depender de país, cuenta, permisos y suscripción. No hay evidencia aquí de adopción, descargas o calidad comparativa de sus respuestas.

## Comparación

| Integración publicada | Datos y acciones declaradas | Oportunidad para Bobby |
| --- | --- | --- |
| [Era Context](https://chatgpt.com/plugins/plugin_asdk_app_6a1e0440ecc081918f60d334729eb03c) | Unifica bancos, tarjetas e inversiones; categoriza transacciones, identifica cargos recurrentes y proyecta gastos y flujo de caja. | Conectar movimientos autorizados; detectar suscripciones y responder cuánto puede ahorrar el usuario con datos fechados. Es el competidor más cercano al asistente de finanzas personales propuesto. |
| [Interactive Brokers](https://chatgpt.com/plugins/plugin_asdk_app_69bc11db874881918718abaca20b68ce) | Lee posiciones, saldos, ganancias/pérdidas y órdenes abiertas. Prepara instrucciones de operación para revisión y aprobación en IBKR; ChatGPT no envía órdenes directamente al mercado. | Importación de cartera en lectura, concentración y exposición al riesgo. Si se estudia ejecución posteriormente, separar siempre la propuesta de la aprobación en el broker. |
| [Longbridge](https://chatgpt.com/plugins/plugin_asdk_app_6a2baf2fad748191812393c3e00308ef) | Investigación de acciones de EE. UU. y Hong Kong, noticias y fundamentales; cuenta conectada con posiciones, saldos, estados, listas de seguimiento e historial de órdenes. | Lista de activos sincronizada y explicación de qué cambió desde el último análisis de Bobby. |
| [Alpha Vantage](https://chatgpt.com/plugins/plugin_asdk_app_6a5a6774ddc08191a0750a0dc4b10b97) | Precios e históricos, fundamentales, resultados, indicadores técnicos, noticias y sentimiento; varios tipos de activos. | Nuevos análisis solicitados desde ChatGPT con fuentes, fecha y demora de los datos. |
| [Massive](https://chatgpt.com/plugins/plugin_asdk_app_6a4d14f6bfa48191a49bc4f42980ae38) | API de mercado con acciones estadounidenses, opciones, futuros, índices, divisas y cripto; históricos y datos de mercado. | Fuente directa de precios e históricos para escenarios y análisis de cartera. Verificar cobertura, licencia y latencia de cada conjunto antes de elegir proveedor. |
| [Intuit QuickBooks](https://chatgpt.com/plugins/plugin_asdk_app_697aea3231288191b28a0061066e51bd) | Rentabilidad, flujo de caja, cuentas por cobrar/pagar y reportes; declara gestión de facturas y otros registros desde chat. | Una futura modalidad para independientes y pequeños negocios: separar caja empresarial, ingresos personales y obligaciones. |
| [QBO Connector by Meridian](https://chatgpt.com/plugins/plugin_asdk_app_6a59480048788191838477826d4ee97a) | Conecta varias empresas de QuickBooks; permisos de lectura o escritura por empresa; registros contables, facturas y comprobantes. | Permisos por fuente y cuenta, con lectura como primera etapa. La escritura contable requiere un flujo de revisión propio. |

## Referencia nativa que compite por el mismo uso

[Finances en ChatGPT](https://help.openai.com/en/articles/20001222-finances-in-chatgpt) es una función de OpenAI, distinta de un plugin de terceros. Su documentación actual indica disponibilidad en EE. UU. para Free, Go, Plus y Pro, en web, iOS y Android. Conecta cuentas mediante Plaid y, de forma separada y opcional, datos crediticios mediante Experian; permite revisar gastos, suscripciones, facturas, patrimonio e inversiones. Su cobertura estadounidense no demuestra cobertura bancaria para Bobby en México o Europa.

## Diferencia con lo construido

El conector local de Bobby recibe datos financieros seleccionados que el usuario revisa y aprueba en su cuenta, y devuelve recomendaciones previamente guardadas. Ese contexto se conserva en el backend compartido para web, iOS y Android. No incorpora aún conexiones bancarias, importación de cartera desde brokers ni un método del conector para solicitar un análisis nuevo. Tampoco accede automáticamente al historial completo de ChatGPT. La conexión publicada, las cuentas reales y los dispositivos físicos siguen sin validar.

## Orden recomendado para ampliar Bobby

Esta priorización es una propuesta de producto derivada de la comparación, no una medición de demanda.

1. **Pedir un análisis nuevo a Bobby desde ChatGPT.** Mostrar fuentes, fecha, estado de generación y enlace al mismo resultado en Bobby. Un análisis recién generado debe distinguirse de uno recuperado del historial.
2. **Objetivos y simulaciones.** Registrar una meta revisada y consultar progreso o escenarios con supuestos visibles. Ejemplo: cuánto cambia el plazo de ahorro al modificar el aporte mensual.
3. **Cartera en lectura.** Posiciones, valor, concentración, exposición y cambios desde el último análisis. Elegir un proveedor y comprobar cobertura de las cuentas que usan los clientes de Bobby.
4. **Movimientos y suscripciones.** Conexión bancaria autorizada o importación de archivo revisada, con origen y fecha; separar transacciones reales de datos declarados en un chat.
5. **Finanzas del negocio.** Solo si validamos interés: caja, facturas y reportes para independientes. Requiere separación de cuentas y controles distintos de los de una cartera personal.

## Integrar proveedores requiere una conexión propia

Que un proveedor tenga un plugin instalable en ChatGPT no crea automáticamente acceso a su API desde Bobby. Para incorporar sus datos de forma estable debemos comprobar autenticación, cobertura, costes y derechos de almacenamiento y presentación con cada proveedor. Los [términos financieros de OpenAI](https://openai.com/policies/financial-services-terms/) distinguen el acceso de los derechos sobre datos de socios y señalan que exportar o compartir no amplía esos derechos. No se propone copiar masivamente datos de otros plugins al backend de Bobby.

La recomendación inicial es ampliar el análisis propio y el seguimiento de objetivos, y evaluar una fuente de cartera o transacciones en lectura. La ejecución de operaciones queda fuera de esta propuesta inicial.
