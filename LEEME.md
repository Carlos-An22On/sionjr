# Comercializadora Sion JR SAS — versión para tu servidor

Este paquete es una versión independiente del sitio que preparamos, lista para alojar en tu propio servidor. Incluye todo el código editable, el logo, el diseño verde oscuro, el teléfono y WhatsApp, las cuatro zonas y un panel protegido para administrar materiales y precios.

## Qué necesitas

- Un servidor o VPS que permita ejecutar **Node.js 24.15 o superior**, o Docker.
- Un dominio o subdominio, si deseas usarlo, y HTTPS para publicar el panel de administración.
- Un disco persistente para la base de datos SQLite. Un único proceso del programa en un único servidor.

No funciona subiendo los archivos como una página estática. Un hosting que solo permita PHP o archivos HTML necesita otra adaptación. El programa no depende de Sites, Cloudflare D1 ni de una cuenta de ChatGPT.

## Instalación directa: prueba local

1. Descomprime el ZIP y entra en la carpeta `sion-jr-servidor`.
2. Instala Node.js 24.15 o superior y comprueba con `node --version`.
3. Copia `.env.example` a `.env`.
4. Edita `.env` y escribe una contraseña larga en `ADMIN_PASSWORD` (mínimo 12 caracteres). No uses una contraseña de ejemplo. Si tiene símbolos especiales, puedes escribirla entre comillas dobles.
5. Para probar en el mismo computador, conserva `APP_ORIGIN=http://localhost:3000`.
6. Ejecuta:

```bash
npm start
```

No hay dependencias que descargar con `npm install`. Abre `http://localhost:3000` para los clientes y `http://localhost:3000/administrar` para el propietario. Usa exactamente la dirección configurada en `APP_ORIGIN`: ingresar desde otra dirección provoca el rechazo de los cambios.

En Linux puedes preparar el archivo así:

```bash
cp .env.example .env
chmod 600 .env
```

En Windows puedes copiarlo con el explorador y editarlo con un editor de texto.

## Publicar en un servidor con dominio

1. Copia la carpeta al servidor, por ejemplo `/opt/sion-jr`.
2. Crea `.env` con tu contraseña y cambia `APP_ORIGIN` por la URL final, por ejemplo `https://materiales.tudominio.com`. No agregues rutas a esa URL.
3. Mantén `HOST=127.0.0.1` y `PORT=3000` si usarás Nginx en el mismo servidor.
4. Configura Nginx o el proxy de tu proveedor para enviar las solicitudes del dominio a `http://127.0.0.1:3000`. Se incluye `nginx.conf.example` como punto de partida; configúralo para tu dominio y agrega tu certificado HTTPS antes de usar el panel públicamente.
5. Configura el programa como servicio para que siga funcionando al cerrar la terminal. El archivo `sion-jr.service.example` sirve de base para systemd en Linux: ajusta el usuario, la ruta de Node y la carpeta de instalación. El usuario del servicio debe poder escribir en `data/` y leer `.env`.

Ejemplo de comandos para un administrador Linux, una vez creado el usuario `sion` y configuradas las rutas:

```bash
sudo mkdir -p /opt/sion-jr/data
sudo chown -R sion:sion /opt/sion-jr
sudo cp /opt/sion-jr/sion-jr.service.example /etc/systemd/system/sion-jr.service
sudo systemctl daemon-reload
sudo systemctl enable --now sion-jr
```

La ruta `/administrar` usa una contraseña propia. Los clientes no tienen que iniciar sesión. No publiques `.env` ni `data/` desde Nginx: usa el proxy hacia el programa, no toda la carpeta como raíz de archivos.

## Alternativa con Docker

Crea `.env` como se indicó y establece `APP_ORIGIN` con tu dirección final. Luego:

```bash
docker compose up -d --build
```

El programa escucha en el puerto 3000, expuesto solo en `127.0.0.1` del servidor. Usa un proxy con HTTPS para el dominio público. La base de datos se conserva en el volumen `sion_data`. No ejecutes `docker compose down -v` si quieres conservar los precios.

El contenedor queda configurado con `restart: unless-stopped`, por lo que Docker lo vuelve a levantar automáticamente si el proceso falla o si el servidor se apaga y vuelve a encender, siempre que el servicio de Docker arranque con el sistema operativo.

## Despliegue en Dokploy

1. Crea la aplicación en Dokploy como proyecto Docker Compose.
2. Usa `compose.dokploy.yaml` como archivo de Compose.
3. Configura estas variables de entorno en Dokploy:

```bash
DOMAIN=materiales.tudominio.com
ADMIN_PASSWORD=una-contrasena-segura-de-12-caracteres-o-mas
```

No incluyas `https://` en `DOMAIN`. El archivo de Dokploy publica la app por HTTPS con Traefik y configura internamente `APP_ORIGIN=https://${DOMAIN}` para que el panel acepte correctamente las solicitudes desde el dominio final.

La base de datos SQLite queda guardada en el volumen Docker `sion_data`, montado en `/app/data`. Ese volumen es persistente: no se pierde al reiniciar el contenedor ni al apagar y encender el servidor. No elimines el volumen desde Dokploy si quieres conservar precios y materiales.

Si el servidor físico se reinicia, asegúrate de que Docker esté habilitado al arranque del sistema. En un servidor Linux normalmente se hace con:

```bash
sudo systemctl enable --now docker
```

Dokploy debe tener creada su red externa `dokploy-network`; es la red estándar que usa Traefik en Dokploy. Si tu instalación usa otro nombre de red, cambia `dokploy-network` en `compose.dokploy.yaml`.

Para revisar el funcionamiento:

```bash
docker compose logs --tail=100
```

## Uso del propietario

1. Abre `https://tu-dominio/administrar`.
2. Ingresa la contraseña configurada en `.env`.
3. Selecciona Castilla, Acacías, Villavicencio o Restrepo.
4. Agrega el nombre del material, su precio en pesos enteros y la unidad.
5. Pulsa **Guardar precio**. Para cambiarlo, pulsa **Editar** junto al material.

Cada precio pertenece a una zona. Para vender el mismo material con diferentes precios, agrega un registro por cada zona. Un cambio en Acacías no modifica el precio de Castilla. Las sesiones duran hasta 8 horas; reiniciar el programa cierra las sesiones.

## Materiales iniciales

Al preparar este paquete, la lista del sitio publicado estaba vacía. Por eso `precios-iniciales.json` contiene `[]`; no hay precios inventados ni datos de ejemplo que se publiquen automáticamente.

Puedes agregar los precios desde el panel. Si tienes una lista en JSON, puedes importarla con el programa detenido:

```bash
node --env-file=.env scripts/importar-precios.mjs precios-iniciales.json
```

Cada registro debe tener `name`, `price` (número entero COP), `unit` (`kg`, `unidad` o `tonelada`) y `zone` (`castilla`, `acacias`, `villavicencio` o `restrepo`). El campo `id` es opcional; al importar repetidamente sin IDs se crearán registros nuevos. Un `id` existente actualiza ese registro.

## Datos y copias de seguridad

Los precios se guardan en `data/sion.sqlite`; no se pierden al cerrar el navegador ni al reiniciar el programa. No guardes esa carpeta en un disco temporal ni la reemplaces al actualizar el código.

En instalación directa, detén el servicio antes de copiar toda la carpeta `data/`, y vuelve a iniciarlo después. Guarda la copia en otro lugar. Para restaurar, detén el servicio, sustituye `data/` por la copia y reinicia. En Docker, conserva y respalda el volumen persistente usando las herramientas de tu servidor.

Para cambiar la contraseña, edita `ADMIN_PASSWORD` y reinicia el programa. El reinicio invalida las sesiones anteriores. Nunca incluyas `.env` en un repositorio público.

## Código y comprobaciones

- `server.mjs`: servidor, acceso de administrador, sesiones y base de datos.
- `public/`: página de clientes, panel, logo y estilos.
- `scripts/importar-precios.mjs`: importación de listas.
- `tests/app.test.mjs`: comprobaciones de autenticación, aislamiento por zona y persistencia.

Puedes comprobarlo con:

```bash
npm test
```

Node puede mostrar una advertencia sobre el módulo integrado `node:sqlite`; no indica un fallo de la aplicación. Documentación de referencia: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html

## El QR y los costos

El sitio de ChatGPT que ya está publicado no cambia al descargar este paquete. Después de instalarlo, crea el QR con la **URL de tu nuevo servidor** antes de imprimir la tarjeta. Los precios se pueden cambiar sin cambiar ese QR mientras mantengas la misma URL.

Este paquete no contrata alojamiento ni dominios. Los costos de tu servidor y tu dominio dependen de tu proveedor. No incluye licencias comerciales de componentes ni usa APIs de pago.
