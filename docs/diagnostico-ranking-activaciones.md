# Diagnóstico del ranking y activaciones — 2026-10-08

## Actualización tras confirmar la regla funcional

Se corrigió únicamente en `MetricsDashboard.vue` la atribución de líder: ahora resuelve `activaciones.usuario_id → /portal/users.usuario_id → lider_id` actual, conservando el universo recibido de `/portal/activations`. Selector y agregado de líderes usan esa relación, sin fallback al snapshot histórico. El catálogo es necesario para cargar estas métricas; si falla se muestra error. Los UUID se conservan en las claves del ranking y no se agrupan personas por nombre. Fecha, plaza, tipo, activador y equipo mantienen sus filtros. Ranking, KPI total y CSV siguen consumiendo el mismo corte.

La regresión local `tests/metrics-dashboard.test.mjs` usa datos sintéticos explícitos: cinco activaciones de un integrante actual, cuatro con otra líder histórica y una con la actual. Antes el filtro actual conservaba una; ahora conserva cinco. Incluye filtros combinados, identidades distintas con igual nombre, alcance recibido global/limitado, igualdad con CSV y fallo de catálogo. No demuestra la resolución del caso real de Liz ni verifica el despliegue. El diagnóstico original que sigue describe el estado anterior a esta corrección.

## Estado y evidencia

**Implementación detenida por falta de evidencia del caso real.** El reporte de Liz Susana Rodríguez Guzmán (ranking 1, tabla 4) procede de la incidencia comunicada; no se ha reproducido ni confirmado contra Supabase. No es correcto concluir que el valor esperado sea 4 sin identificar los registros, sus UUID, filtros y alcance.

Revisión del código local en `22d8e1f`. No se ha comprobado que esa versión sea la desplegada. `.env.local` no contiene configuración Supabase y tampoco se encontraron variables Supabase de proceso ni un conector de base de datos disponible. No se utilizaron credenciales de despliegue para obtener secretos. No se ejecutó ninguna consulta contra producción.

Los archivos preexistentes no versionados `DOCUMENTACION_TECNICA_PORTAL.md` y `supabase/impulsa360_database_install_v1.0.sql` no se modificaron ni se consideran prueba del esquema desplegado.

## Mapa de consultas y reglas comprobadas

| Consumidor | Origen / función | Universo y regla |
| --- | --- | --- |
| Ranking | `src/components/MetricsDashboard.vue:49`, `dashboard:321`, `activadorKey:140` | `fetchAllActivaciones()`. Cuenta cada fila filtrada; agrupa por `usuario_id`, con fallback a nombre normalizado y luego `none`. Sin filtro de estado/tipo implícito. |
| KPIs y métricas por activador | Mismo `dashboard`, `:365-397` | Total y ranking se calculan en la misma iteración. El selector de activador filtra la clave estable. No hay otro endpoint de métricas individuales conectado al portal en este árbol. |
| Tabla | `src/pages/ActivacionesPage.vue:29`, `src/components/ActivacionesTable.vue:96` | Mismo cargador; filtra en memoria por subcadena de `impulsador`, plaza y distrito, más fechas. Renderiza todas las filas filtradas. |
| CSV Dashboard | `MetricsDashboard.vue:465`, `exportarDashboard` | Exporta `dashboard.rows`, exactamente las filas que alimentan el total y ranking. |
| CSV / Excel personalizado tabla | `ActivacionesTable.vue:583`, `getDatosParaExportar`; `:681`, `:754` | Filas filtradas en memoria, sin una consulta adicional. |
| Excel servidor | `ActivacionesTable.vue:708`; `server/app.js:1482`; `server/activacionesExcel.js:50` | Vuelve a consultar Supabase; fechas en SQL/PostgREST, texto en JS. Mismo criterio de autorización del listado, implementado por separado. |
| RPC de métricas y detalle | `supabase/migrations/202607310001_control_activadores_rpc.sql:12`, `:217` | `control_activadores_jerarquia`, `control_activaciones_detalle`: atribución histórica por equipo/líder; no se encontraron invocaciones desde `src` ni desde el backend del portal. Posible contrato compartido; no modificar. |

### Autorización, identidad y joins

`resolvePortalUser` (`server/app.js:1306`) valida el Bearer y busca el perfil mediante `activadores.auth_user_id = authData.user.id`. Requiere estado `activo` y rol principal administrador/líder/banco. La identidad usada después es **`activadores.usuario_id`**, no el UUID de autenticación.

`GET /portal/activations` (`:1463`) usa el cliente de servicio (`:959`), consulta `activaciones` sin joins, y para líder obtiene los `activadores.usuario_id` cuyo `lider_id` coincide con el UUID de perfil de la líder. Aplica `activaciones.usuario_id IN (...)` antes de paginar. Sin integrantes devuelve vacío. Administrador no recibe ese recorte. No filtra activadores por estado ni exige que la activación tenga el snapshot del líder actual. El Excel aplica la misma regla (`:1482`). No se alteró este comportamiento.

`attachActivationSignedPhotos` (`:643`) hace un `map` y agrega enlaces; no elimina ni multiplica filas. Los joins de organización del catálogo de usuarios no alimentan los conteos del Dashboard.

Las políticas locales de `202609070001_secure_activadores_activaciones_rls.sql` permiten lectura directa propia por `usuario_id = auth.uid()`. No son la autorización de equipo del endpoint de servicio. El estado real de RLS debe inspeccionarse en producción; no se presume a partir de archivos. El desacople de identidad en `202609160004_desacoplar_auth_historico.sql` diferencia PK histórica y `auth_user_id`. Los RPC históricos aún consultan por `auth.uid()` contra `usuario_id`; no usarlos como sustituto sin analizar consumidores móviles e identidad.

### Diferencias comprobadas; causalidad de Liz pendiente

1. **Nombre frente a UUID.** La tabla busca por subcadena de `impulsador`; el ranking agrupa por UUID. Cuatro filas con el mismo nombre visible no prueban una sola identidad. El ranking pierde la clave al traducir a `{ label, value }` (`:396`) y renderiza con `:key="item.label"` (`:500`): nombres repetidos pueden producir claves Vue repetidas. Esto es un riesgo comprobable del código, no prueba de que haya ocurrido con Liz. No fusionar personas por nombre.
2. **Líder actual frente a histórico.** El backend limita al equipo actual por `activadores.lider_id`; el selector del Dashboard usa `lider_id_registro` (o nombre histórico si falta UUID). La tabla no tiene selector de líder. Una sesión de líder y un filtro histórico seleccionado no son condiciones equivalentes.
3. **Plaza.** Dashboard compara clave exacta `pid:UUID` o texto canónico `pkey:...`; tabla y Excel comparan subcadena de texto. El Dashboard ignora cadenas vacías al escoger plaza; tabla y Excel usan `??`, conservándolas. UUID y texto sin UUID pueden formar grupos separados aunque la etiqueta sea igual.
4. **Fechas.** Dashboard usa prefijo de `fecha_activacion` y fallback a `created_at`. Tabla solo usa `fecha_activacion` y reordena extremos invertidos; Dashboard y Excel servidor no los reordenan. Excel compara directamente la columna. Confirmar su tipo desplegado: con `date` el fin es inclusivo; con timestamp hay que revisar el límite de medianoche. El fallback del Dashboard toma el prefijo sin convertir zona horaria.
5. **Otros filtros.** Dashboard tiene tipo y equipo; tabla tiene distrito. No deben compararse cortes con filtros exclusivos activos. Los filtros viven en componentes separados y no se sincronizan.
6. **Carga parcial potencial.** `src/lib/activacionesService.js:15` pide rangos de 1.000, concatena y termina con una página menor a 1.000. No pide `count`, no valida completitud, no deduplica por ID. Excel replica el patrón. Ambos ordenan solo por `created_at DESC`: empates y cambios concurrentes pueden desplazar filas entre páginas. Un límite efectivo de PostgREST menor a 1.000 produciría final prematuro. No se conoce el límite real ni se observó truncamiento. El listado de integrantes tampoco se pagina. La paginación visual del ranking (`:421-425`, 10 personas) ocurre **después** de agregar, por lo que no cuenta únicamente esa página visual.
7. **Momentos diferentes.** Ambas pantallas cargan al montarse; Excel servidor consulta de nuevo. No existe una instantánea compartida ni refresco periódico. Cambios entre lecturas pueden afectar la comparación.

### Diferencias intencionales de métricas

Total = filas autorizadas cargadas que pasan los filtros; no hay exclusión general de errores, cash-in, tipo, foto faltante o estado. Hoy, semana y mes son subconjuntos temporales del corte; el reloj se fija al montar en America/La_Paz. Semana va de lunes a hoy; mes usa prefijo de mes e incluye posibles fechas futuras de ese mes. Cash-in y errores requieren booleano `true`. Tiendas se deriva de clasificación de texto; comercios cuenta nombres normalizados únicos, no activaciones. Promedios dividen por períodos presentes, no por todos los días calendario. No exigir igualdad de estos KPIs con el total.

Los RPC históricos agregan por usuario/equipo/líder y exigen perfiles/equipos vigentes activos; reconstruyen snapshots faltantes con historial. Su mes llega hasta `current_date` y su zona depende de sesión SQL. Son reglas distintas del Dashboard, sin evidencia de uso por esta pantalla.

## Consultas y datos pendientes

Ver `docs/diagnostico-ranking-activaciones.sql`: transacción de solo lectura, introspección del esquema real y extracción restringida al equipo actual de una líder verificada. No ejecuta RPC, no suplanta `auth.uid()`, no cambia roles, políticas ni datos. Un resultado vacío con parámetros vacíos **no** prueba ausencia de activaciones. Un resultado SQL bajo una cuenta administrativa no prueba por sí solo la autorización HTTP/RLS de la líder.

Datos mínimos requeridos:

- URL y revisión/build desplegado; momento de observación de ambas pantallas.
- UUID de perfil (`usuario_id`) de la líder, su rol principal y confirmación de la misma sesión en ambas vistas. No compartir tokens ni contraseñas.
- Todos los valores de filtros de ambas vistas, incluyendo valores internos de selectores (`uid:`, `lid:`, `pid:`), tipo, equipo, distrito y extremos de fechas; indicar filtros vacíos.
- IDs de las cuatro activaciones, UUID del activador seleccionado en el ranking, y salida acotada de la consulta de evidencia. El nombre solo sirve para localizar candidatos dentro del alcance autorizado.
- Respuestas de las páginas de `/portal/activations` de ambas lecturas: rango, cantidad recibida, IDs y campos de filtro/identidad de las cuatro filas. Excluir enlaces de evidencia, fotos, clientes y cabeceras de autorización. Informar total de IDs únicos y repetidos en el conjunto completo.
- Límite efectivo de filas PostgREST y resultado de introspección (tipos, constraints, políticas, definiciones RPC si la vista desplegada realmente los usa).

## Validación y criterio de desbloqueo

| Validación solicitada | Resultado |
| --- | --- |
| Reproducir 1 frente a 4 con filtros/alcance idénticos | Pendiente: no hay registros ni captura de peticiones reales. |
| Confirmar conteo contra Supabase autorizado | Pendiente: SQL preparado, no ejecutado. |
| Ranking = total KPI = filas de su CSV | Misma iteración/array verificada estáticamente; valor real y duplicados pendientes. |
| Tabla = ranking con corte equivalente | No acreditado; deben compararse IDs y claves, no etiquetas. |
| Fechas, plaza, activador, líder | Reglas divergentes identificadas arriba; pruebas con datos reales pendientes. |
| Permisos de líder | Restricción del backend trazada; prueba de integración con líder y otro equipo pendiente. |
| Exportación sin duplicados/incompletos | No garantizado por el código; comparar IDs y conteos SQL, incluyendo varias páginas. |

Para demostrar causa, construir una matriz de las cuatro filas: pertenencia al universo autorizado, presencia en cada carga, `usuario_id`, clave de ranking, y resultado de cada filtro. Si una fila falta, identificar el primer punto donde desaparece: base autorizada → página HTTP → array → filtro → grupo. Si las cuatro comparten identidad, presencia y filtros, el código actual debe agregarlas a 4; investigar versión desplegada o renderizado con claves repetidas, sin corregir valores manualmente.

Tras demostrar causa, corregir solo la capa responsable y probar: cortes de fechas (también nulos/extremos invertidos), plaza por identidad y texto, UUID de activador con nombres repetidos, filtro histórico de líder, sesión de líder con otro equipo excluido, más de una página con fechas de creación empatadas, IDs únicos y las tres exportaciones. No reutilizar RPC compartidos sin análisis de impacto móvil.

## Entrega y riesgos

Verificación local: `npm run build` terminó correctamente (134 módulos), con aviso de chunks mayores a 500 kB. Esto acredita compilación, no conteos ni conexión a Supabase; faltan las variables para ejecutar el portal contra datos reales. `git diff --check` no reportó errores en cambios versionados; los dos documentos nuevos se revisaron por lectura. No hay script de tests en `package.json`. El SQL preparado no se ejecutó ni se validó contra el esquema remoto.

No se aplicó corrección funcional: falta evidencia causal. Solo se añadieron este informe y el SQL diagnóstico. Sin cambios de app móvil, backend, RLS, tablas, funciones, históricos, commits ni push. Los riesgos identificados siguen abiertos; no se atribuyen al caso reportado hasta obtener datos. Las pruebas de producción y de permisos no se declaran aprobadas.
