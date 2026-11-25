# Continuidad de HelpDesk AI: formación y revisión SLA

Fecha: 2026-11-17. Documento de contexto y propuestas; no es una nueva orden de implementación.

## Leer al retomar

1. Conserva el objetivo y los cambios de la tarea que ya estaba en curso. Identifica primero la rama, el estado de Git y cualquier trabajo local pendiente. Este documento no demuestra el punto exacto donde se pausó la sesión.
2. Lee las reglas de [AGENTS.md](../../AGENTS.md) y la documentación que ese archivo exige. No sustituyas el flujo existente por el resumen de esta revisión.
3. Contrasta estas observaciones fechadas con los archivos y el estado actuales antes de actuar. Si la tarea pausada es otra, conserva este documento como contexto y continúa con aquella.
4. La incorporación de estos archivos autoriza documentación de continuidad. No autoriza por sí sola cambios de tickets, asignaciones, respuestas, migraciones, fusiones, despliegues ni nuevas funcionalidades. Las propuestas de abajo requieren concretar especificación, QA y plan y obtener aprobación antes de implementar.

## Contexto aportado por el propietario

**Reported:** Vidal aclara que HelpDesk AI es un proyecto en desarrollo para aprender, y que las empresas y los datos de los casos revisados son ficticios. Los tickets antiguos, sin propietario o vencidos son escenarios útiles para practicar el flujo; no deben presentarse como incidentes de clientes reales ni como resultados comerciales.

Se busca aprender cómo administrar tickets abiertos, resueltos y cerrados, conservar el historial y entender los indicadores SLA. Mantener calidad de ingeniería y controles de acceso también en la demo.

## Estado publicado verificado durante esta revisión

- Aplicación: [vidal-renao/ticket-system](https://github.com/vidal-renao/ticket-system). Rama de referencia: `feat/audit-account-lifecycle`, commit `445e2c71c14c9f6baeea3cbf3609178107ecd3bb` antes de añadir este documento. Es la rama no principal con actividad publicada más reciente en los dos repositorios revisados; no prueba que sea la rama local de una sesión pausada.
- [PR #20](https://github.com/vidal-renao/ticket-system/pull/20) abierta: auditoría de congelación, reactivación, eliminación y restauración de cuentas; compatibilidad del parser del asunto SLA en `/ops`. El último commit incorpora `main`. [CI de ese commit](https://github.com/vidal-renao/ticket-system/actions/runs/43983368744) completada correctamente. No se han ejecutado pruebas nuevas de la aplicación como parte de esta revisión documental.
- `main`: `88edbb623d4c244d871b600f7b25da2a245cb1b0`; la [PR #30](https://github.com/vidal-renao/ticket-system/pull/30), Fase 0 de endurecimiento, ya está fusionada. Fusionar código no demuestra qué migraciones o versiones están desplegadas. Las [notas de Fase 0](../qa/2026-11-16-fase0-pr-notes.md) son evidencia fechada, no una autorización pendiente que este documento conceda.
- Servicio complementario: [vidal-renao/vidal-helpdesk-mcp](https://github.com/vidal-renao/vidal-helpdesk-mcp), `main` en `58fc36a008573599434ebc9de5819e2b2ff9141a`. Genera el informe SLA; la aplicación es propietaria del modelo de datos. Esta incorporación no modifica ese repositorio.
- No se inspeccionó el disco del ordenador del propietario ni el contenido privado de la sesión de Claude Code. Cambios locales no subidos y la tarea conversacional exacta: **Unknown**.

## Flujo que ya existe

Según [README](../../README.md), [DOMAIN](../../DOMAIN.md), [SDD](../../SDD.md) y `lib/manual-content.ts`, el recorrido incluye entrada, asignación, ejecución, revisión del administrador, resolución y confirmación del cliente. Existe un manual para administradores en `/admin/manual`, en DE/EN/ES.

- El agente trabaja solo en sus tickets asignados; la asignación y aprobación corresponden al administrador.
- La solicitud de revisión usa `review_status`; no debe convertirse en un nuevo estado operativo ni confundirse con espera del cliente.
- `pending_customer` y `pending_third_party` tienen significados distintos.
- La primera respuesta pública, resolución y cierre son hitos diferentes.
- La reapertura del cliente corresponde a su ticket resuelto dentro de 48 horas; no se propone ampliar permisos ni reabrir un cerrado desde el flujo del cliente.

Contrastar el comportamiento actual en código antes de presentar cualquier recorrido como probado o desplegado.

## Evidencia de la revisión SLA

Fuente inicial: informe diario del 2026-11-16, instantánea a las 14:42 CET (Europe/Zurich). Se leyó el correo y se contrastaron los registros en Supabase en solo lectura el 2026-11-17, aproximadamente a las 06:40 CET. No se enviaron respuestas ni se modificaron tickets, usuarios o configuración.

La instantánea indica 7 activos con algún objetivo SLA incumplido, 4 sin propietario, 6 de los 7 en una empresa ficticia y antigüedad máxima de 87 días. Las edades siguientes son las del informe, no edades actuales.

| Orden propuesto para practicar | Ticket | Prioridad registrada | Edad en la instantánea | Propietario |
|---|---|---|---:|---|
| 1 | TK-0077 | critical | 87 días | Asignado |
| 2 | TK-0083 | critical | 2 días | Sin asignar |
| 3 | TK-0079 | high | 86 días | Sin asignar |
| 4 | TK-0080 | high | 81 días | Sin asignar |
| 5 | TK-0076 | medium | 87 días | Asignado |
| 6 | TK-0078 | medium | 87 días | Sin asignar |
| 7 | TK-0082 | medium | 2 días | Asignado |

Este orden usa prioridad registrada y después antigüedad; el impacto empresarial no fue validado y no se deduce del título. Es un ejercicio propuesto, no una instrucción de actuación urgente.

Observaciones verificadas y límites:

- El 100 % de cumplimiento corresponde a 2 tickets resueltos durante los últimos 7 días; los 7 incumplimientos pertenecen a la cola abierta. Son poblaciones distintas. TK-0081 y TK-0084 tenían fechas de respuesta y resolución dentro de sus vencimientos almacenados.
- TK-0078 ya tenía primera respuesta registrada y comentarios. Para este caso se practica continuidad; no se propone enviar otra primera respuesta.
- Al emitirse el informe, TK-0082 tenía vencida la respuesta; su resolución vencía ese mismo día a las 16:28 CET, después de la instantánea. Incumplir un objetivo no significa incumplir ambos.
- En la lectura de los siete abiertos, los indicadores almacenados de incumplimiento seguían en `false`. El código de `vidal-helpdesk-mcp/src/lib/sla-audit.ts` evalúa también fechas en el momento de la consulta, incluso antes de que se escriban esos indicadores. Por tanto, la diferencia no demuestra por sí sola un fallo del informe. Revisar consumidor y actualización si se investiga.
- Las dos familias de campos de vencimiento coincidían en los siete registros revisados. Varios tickets creados en agosto tenían vencimientos en octubre: el origen histórico de esas fechas sigue sin comprobarse.
- El informe enumera TK-0083 después de los dos altos y varias acciones se solapan. Valorar su orden y claridad como propuesta de presentación, sin declarar roto el cálculo.

## Propuestas para una futura práctica aprobada

1. Recorrer un caso de principio a fin reutilizando el manual existente: asignación, respuesta pública, ejecución, revisión administrativa, resolución y confirmación.
2. Contrastar interfaz, campos persistidos e historial en cada hito; distinguir pruebas realizadas de resultados esperados.
3. Practicar continuidad con un ticket ya respondido y comparar un resuelto a tiempo con otro resuelto tarde.
4. Evaluar claridad de los indicadores: mostrar el denominador y separar respuesta, resolución, cola abierta y casos terminados.

Antes de cualquier ejercicio que escriba datos, identificar entorno, registros de prueba, permisos y efectos de email/cron. Que los datos sean ficticios no hace que las comunicaciones o costes de proveedor sean simulados.

Comprobación mínima siguiente, si forma parte de la tarea autorizada: confirmar vigencia y ámbito de los registros, impacto simulado que se quiere representar, propietario/historial y origen del cálculo SLA, con una misma hora de corte. No ejecutar ejercicios ni limpiar tickets automáticamente al cargar este archivo.

## Incorporación y lectura en Claude Code

`CLAUDE.md` importa este documento y `AGENTS.md`. La lectura depende de que ambos archivos estén en el entorno y rama de la sesión y de que Claude cargue las instrucciones. Un commit remoto no actualiza por sí solo una copia ya abierta.

Al retomar, conservar cambios locales y comprobar primero qué archivos están disponibles. No hacer reset, checkout forzado, stash ni integración automática para obtener este contexto. Si la sesión no ha recibido o cargado los archivos, indicar esa limitación y utilizar el mecanismo de actualización/lectura de su entorno. No afirmar que se ha leído el documento sin haberlo recibido.

© VIDAL ECOSYSTEM
