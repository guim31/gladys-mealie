# Mealie

[Mealie](https://mealie.io/) es un gestor de recetas autoalojado: sus recetas,
un menú semanal y listas de la compra compartidas. Esta integración lo lleva a
Gladys: un dispositivo muestra las comidas de hoy y de mañana, el número de
recetas y los artículos que quedan por comprar en cada lista; las escenas
pueden añadir un artículo a una lista («se ha acabado la leche»), marcar uno,
planificar una receta o enviar el menú del día; dos widgets del panel muestran
el menú y una lista de la compra, con botones para añadir, marcar y
planificar desde la tableta de la pared.

Probada con servidores Mealie reales 2.0.0 y 3.28; todavía no en una
instalación real de Gladys: sus comentarios son bienvenidos en
[las issues](https://github.com/guim31/gladys-mealie/issues).

## Lo que necesita

- Gladys Assistant 5.2.0 o posterior.
- Mealie 2.0 o posterior (Mealie 1.x no tiene la API de hogares), accesible
  desde la máquina de Gladys: en la red local, o en Internet en HTTPS.
- Un token de API de un usuario de Mealie. Actúa con los permisos de ese
  usuario, sobre el menú y las listas de la compra de su hogar.

## Primeros pasos

### 1. Crear un token de API

En Mealie, haga clic en su avatar, abra su **perfil** y luego **API Tokens**.
Dé un nombre al token (por ejemplo `Gladys`) y haga clic en **Generar**. Copie
el token: Mealie solo lo muestra una vez.

### 2. Configurar la integración

En Gladys, **Integraciones → Mealie → Configuración**:

- **Dirección de Mealie**: la dirección con la que abre Mealie, puerto
  incluido, por ejemplo `http://192.168.1.2:9925` o
  `https://mealie.example.com`. También sirve una dirección copiada del
  navegador (`…/g/home/recipes`).
- **Token de API**: el token del paso 1.
- **Aceptar certificados autofirmados**: solo para una dirección `https://`
  cuyo certificado tampoco reconoce su navegador.
- **Intervalo de actualización**: la frecuencia de lectura de Mealie, 5 minutos
  por defecto (de 1 a 15 minutos). Lo que hace desde Gladys se ve al instante.
- **Idioma de los nombres y mensajes**: el idioma de los nombres de las
  funciones y de los textos de las acciones de escena (francés por defecto).

Guarde y haga clic en **Probar la conexión**: Mealie responde con su versión,
su hogar y lo que contiene.

### 3. Añadir el dispositivo

En **Integraciones → Mealie → Descubrir**, añada el dispositivo **Mealie**. Sus
valores aparecen al instante. Cuando se crea una lista de la compra en Mealie,
el dispositivo propone **Actualizar** en la pestaña Descubrir: su contador se
añade entonces.

## El dispositivo Mealie

Un dispositivo por hogar de Mealie (el hogar del usuario del token). Sus
funciones:

| Función                | Tipo     | Valor                                                |
| ---------------------- | -------- | ---------------------------------------------------- |
| `Desayuno de hoy`      | Texto    | Las recetas (o notas) del menú, o «Nada previsto»    |
| `Comida de hoy`        | Texto    | Igual                                                |
| `Cena de hoy`          | Texto    | Igual                                                |
| `Desayuno de mañana`   | Texto    | Igual, para mañana                                   |
| `Comida de mañana`     | Texto    | Igual                                                |
| `Cena de mañana`       | Texto    | Igual                                                |
| `Recetas`              | Contador | Número de recetas en Mealie                          |
| `Por comprar: <lista>` | Contador | Artículos aún por comprar en cada lista (sin marcar) |

Dos recetas para una misma comida se muestran así: `Quiche lorraine ·
Ensalada`. «Hoy» sigue la zona horaria de Gladys: justo después de
medianoche, las comidas de mañana pasan a ser las de hoy. Los nombres se dan
en el idioma de la configuración al añadir el dispositivo, y se quedan así
después (una regla de Gladys).

## Widgets del panel

En **Panel → Editar panel**, añada un widget de la integración **Mealie**.

### Menú

- **Periodo: Hoy**: la fecha y una fila por comida del día (desayuno, comida,
  cena, acompañamiento, merienda, bebida, postre).
- **Periodo: Próximos 7 días**: una fila por día, hoy y mañana señalados;
  toque un día para ver sus comidas.
- **Planificar** abre un formulario corto (receta, día, comida) y pone la
  receta en el menú de Mealie. Una receta vacía deja que Mealie elija una al
  azar (se aplican sus reglas del menú). La misma receta ya prevista para la
  misma comida no se añade dos veces.
- **Actualizar** vuelve a leer Mealie.
- **Abrir Mealie** abre el planificador, cuando Mealie tiene una dirección
  `https://` (Gladys no abre otros enlaces).

### Lista de la compra

Los artículos aún por comprar de una lista (ajuste **Lista de la compra**: su
nombre en Mealie; vacío: la primera lista creada), con su cantidad y su nota.

- **Añadir** abre un formulario de un solo campo, **Artículo**: escrito tal
  como debe aparecer en la lista. Un artículo que ya está en la lista (sin
  tener en cuenta mayúsculas, acentos ni plural) no se añade dos veces.
- **Marcar** abre un formulario con los artículos: el elegido se marca en
  Mealie, como en su app (desmarcarlo allí lo deshace).
- **Actualizar** vuelve a leer Mealie.
- **Abrir Mealie** abre la lista, cuando Mealie tiene una dirección `https://`.

## Escenas

### Acciones

| Acción                                          | Campos                                           | Resultados                                                           |
| ----------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| **Añadir a la lista de la compra**              | Artículo, Lista de la compra (vacío: la primera) | Artículo añadido (sí/no), Artículo, lista, artículos por comprar     |
| **Marcar un artículo de la lista de la compra** | Artículo, Lista de la compra                     | Artículo marcado (sí/no), Artículo, lista, artículos por comprar     |
| **Añadir una receta al menú**                   | Receta (vacío: al azar), Día, Comida             | Receta añadida (sí/no), Receta, Fecha                                |
| **Leer las comidas de un día**                  | Día (hoy, mañana, pasado mañana)                 | Desayuno, Comida, Cena, todas las comidas del día, comidas previstas |
| **Leer una lista de la compra**                 | Lista de la compra                               | Artículos por comprar (separados por comas), número, lista           |

- Un artículo se encuentra como usted lo dice: `oeufs` encuentra `Œufs`,
  `tomates` encuentra `Tomate`. Una lista se encuentra por su nombre, o por su
  comienzo (`comp` para `Compras`).
- Una receta se encuentra por su nombre o parte de él, como en el buscador de
  Mealie.
- Un artículo que ya está en la lista no se añade de nuevo: el resultado
  **Artículo añadido** vale entonces «no». Un artículo que no está en la lista
  no es un error: **Artículo marcado** vale «no».
- Los resultados pasan a las acciones siguientes de la escena, por ejemplo un
  mensaje `Esta noche: {{0.0.dinner}}` (`0.0`: la posición de la acción en la
  escena; el editor del mensaje lista los resultados).
- Las comidas merienda, bebida y postre necesitan Mealie 3.7 o posterior; un
  Mealie anterior conoce desayuno, comida, cena y acompañamiento.

### Disparadores

Ninguno. Lo que cambia en Mealie (una comida prevista, una lista que crece) es
un estado del dispositivo: una escena se inicia con un cambio de
`Por comprar: Compras` o de `Cena de hoy` con el disparador habitual «estado
de un dispositivo».

### Ideas de escenas

- **«Se ha acabado la leche»**: un botón (o un asistente de voz) lanza **Añadir
  a la lista de la compra** con `Leche`.
- **El menú por la mañana**: cada día a las 7:30, **Leer las comidas de un
  día** (hoy), y luego enviar `Comida: {{0.0.lunch}}, cena: {{0.0.dinner}}`
  por Telegram.
- **De camino a la compra**: cuando alguien sale del trabajo, **Leer una lista
  de la compra**, y luego enviar sus artículos si los hay.
- **Todavía no hay cena prevista**: a las 17:00, si `Cena de hoy` vale «Nada
  previsto», **Añadir una receta al menú** sin receta (Mealie elige una), y
  luego anunciarla.

## Actualización y uso de la API de Mealie

La integración lee Mealie con su propio temporizador (Gladys no lo consulta),
al intervalo de la configuración, y justo después de medianoche. Una lectura
son cuatro peticiones: el menú de los próximos siete días, las listas de la
compra, los artículos por comprar de todas las listas (una petición), las
estadísticas; «quién soy» (versión y hogar) se vuelve a leer una vez por hora.
Mealie no fija ninguna cuota de API. Una acción de escena o un widget vuelve a
leer Mealie cuando la última lectura tiene más de 30 segundos; lo que la
integración cambia se vuelve a leer al instante.

Solo se envían a Gladys los valores que cambian, y todos de nuevo cada
6 horas.

## Solución de problemas

- **«token de API rechazado»**: el token se ha borrado o pertenece a otro
  Mealie. Cree uno nuevo (paso 1).
- **«Mealie no responde»**: compruebe la dirección y el puerto desde la
  máquina de Gladys (`http://<dirección>:9925/api/app/about` debe responder).
  La insignia del dispositivo indica entonces «inaccesible», y sus valores se
  quedan en los últimos leídos.
- **«certificado rechazado»**: marque **Aceptar certificados autofirmados**, o
  use la dirección `http://` en la red local.
- **«se necesita Mealie 2.0 o posterior»**: actualice Mealie.
- **«no hay ningún Mealie en esta dirección»**: la dirección responde con otra
  página web (página de inicio de sesión de un proxy inverso…). Use la
  dirección del propio Mealie.
- **Una lista no tiene contador**: abra la pestaña Descubrir y haga clic en
  **Actualizar** en el dispositivo Mealie.
- **Más detalles**: ponga la variable de entorno `LOG_LEVEL` en `debug`; los
  registros nunca contienen el token de API.

## Límites

- Un solo hogar de Mealie por integración: el hogar del usuario del token.
- El dispositivo muestra el desayuno, la comida y la cena de hoy y de mañana;
  las demás comidas (acompañamiento, merienda, bebida, postre) y el resto de la
  semana están en el widget y en **Leer las comidas de un día**.
- Los artículos se añaden como texto libre (Mealie no lee su cantidad), y
  nunca se borran: los artículos marcados se quedan en Mealie hasta que usted
  los borre allí.
- El formulario **Marcar** lista los 50 primeros artículos; el widget muestra
  7 artículos y el número de los demás.
- **Abrir Mealie** solo aparece con una dirección `https://`.
- Todavía no probada en una instalación real de Gladys; probada con servidores
  Mealie reales 2.0.0 y 3.28.
