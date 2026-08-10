# Manual del Administrador y Staff — Renew Subastas

Este manual es para el equipo de Santa Rosa Paraguay SA que opera **Renew Subastas** (renewsubastas.com.py): administradores, staff de carga de inventario y finanzas. Cubre todo lo que se puede hacer desde el panel interno, campo por campo.

Es más técnico que el manual del comprador porque el equipo interno puede (y debe) entender exactamente qué hace cada botón — sobre todo los que mueven plata.

## Índice

1. [Los cuatro roles y qué puede hacer cada uno](#1-los-cuatro-roles-y-qué-puede-hacer-cada-uno)
2. [Iniciar sesión como staff o admin](#2-iniciar-sesión-como-staff-o-admin)
3. [El menú según tu rol](#3-el-menú-según-tu-rol)
4. [Crear usuarios](#4-crear-usuarios)
5. [Gestionar usuarios existentes](#5-gestionar-usuarios-existentes)
6. [Solicitudes de recuperación de contraseña](#6-solicitudes-de-recuperación-de-contraseña)
7. [Cargar un vehículo](#7-cargar-un-vehículo)
8. [Publicar el vehículo: estados y transiciones](#8-publicar-el-vehículo-estados-y-transiciones)
9. [Crear una subasta](#9-crear-una-subasta)
10. [Precio de reserva vs. precio de Compra Ya — la distinción que no podés confundir](#10-precio-de-reserva-vs-precio-de-compra-ya--la-distinción-que-no-podés-confundir)
11. [Agregar o cambiar el precio de Compra Ya después de crear la subasta](#11-agregar-o-cambiar-el-precio-de-compra-ya-después-de-crear-la-subasta)
12. [Editar una subasta: programada vs. en vivo](#12-editar-una-subasta-programada-vs-en-vivo)
13. [Seguir una subasta en vivo y el panel de Pujas](#13-seguir-una-subasta-en-vivo-y-el-panel-de-pujas)
14. [Marcar VENDIDO — venta en el salón](#14-marcar-vendido--venta-en-el-salón)
15. [Cómo cierran solas las subastas](#15-cómo-cierran-solas-las-subastas)
16. [Cancelar vs. Eliminar una subasta](#16-cancelar-vs-eliminar-una-subasta)
17. [Confirmar la seña recibida o liberar la adjudicación](#17-confirmar-la-seña-recibida-o-liberar-la-adjudicación)
18. [El panel de Ventas](#18-el-panel-de-ventas)
19. [Reporte: insights por vehículo y tráfico del sitio](#19-reporte-insights-por-vehículo-y-tráfico-del-sitio)
20. [Configuración global](#20-configuración-global)
21. [Auditoría](#21-auditoría)
22. [Tabla resumen de permisos](#22-tabla-resumen-de-permisos)
23. [Errores comunes a evitar](#23-errores-comunes-a-evitar)

---

## 1. Los cuatro roles y qué puede hacer cada uno

| Rol                            | Para qué es                                                     | Puede pujar |
| ------------------------------ | --------------------------------------------------------------- | ----------- |
| **Admin**                      | Control total de la plataforma                                  | No          |
| **Staff**                      | Carga inventario, crea y gestiona subastas, atiende compradores | No          |
| **Finanzas**                   | Confirma señas y libera adjudicaciones impagas                  | No          |
| **Retail / Wholesale** (buyer) | Compradores — ven el catálogo y pujan                           | Sí          |

Los emails de **Admin**, **Staff** y **Finanzas** tienen que usar el dominio configurado en Configuración global (por default, `@santarosa.com.py`) — el sistema lo exige tanto al crear la cuenta como al ascender a alguien a uno de estos roles. Los compradores (Retail/Wholesale) no tienen esa restricción.

Nunca se puede pujar ni usar Compra Ya con una cuenta de admin, staff o finanzas — el sistema lo bloquea a propósito: si el operador de la subasta pudiera pujar, podría inflar el precio artificialmente contra un comprador real.

## 2. Iniciar sesión como staff o admin

El inicio de sesión es la misma pantalla que usan los compradores (`renewsubastas.com.py/login`), con correo y contraseña. Tu cuenta te la crea otro administrador (sección 4) — no podés registrarte solo con Google como hacen los compradores retail.

## 3. El menú según tu rol

El menú lateral se arma según tu rol. No es solo una cuestión de gusto: cada ítem que no aparece es una pantalla a la que directamente no tenés acceso (el sistema te rechaza si escribís la URL a mano).

**Admin** ve: Inicio, Usuarios, Vehículos, Subastas, Ventas, Pujas, Reporte, Contraseñas, Auditoría, Configuración.

**Staff** ve: Inicio, Mis vehículos, Mis subastas, Pujas, Reporte, Nuevo usuario. _(Staff no llega a Usuarios, Ventas, Contraseñas, Auditoría ni Configuración — esas pantallas están reservadas a Admin, salvo Ventas que además admite a Finanzas.)_

**Finanzas** ve únicamente: Ventas. Desde ahí llega al detalle de una subasta vendida (sección 17), pero no puede entrar a la lista general de vehículos o subastas, ni ver los datos personales de compradores que no ganaron nada.

## 4. Crear usuarios

**Quién puede crear a quién:**

| Vos sos… | Podés crear…                                    |
| -------- | ----------------------------------------------- |
| Admin    | Retail, Wholesale, Staff, Finanzas, **Admin**   |
| Staff    | Retail, Wholesale, Staff, Finanzas _(no Admin)_ |

Pasos (Admin: menú "Usuarios" → "Crear usuario". Staff: menú "Nuevo usuario"):

1. Elegí el **Rol**: Retail, Wholesale, Staff, Finanzas o Admin (según lo que tu rol te permita).
2. Completá **Nombre**, **Apellido**, **Email** y, opcional, **Teléfono**.
   - Si el rol es Staff, Finanzas o Admin, el email **tiene que** terminar en el dominio configurado (por default `@santarosa.com.py`) — si no, el sistema rechaza con "Los usuarios admin y staff deben usar @santarosa.com.py."
3. Elegí **Tipo de documento** (CI o RUC) y su **Número** — se valida contra el formato paraguayo real; si no coincide, ves "Documento inválido para Paraguay."
4. Tocá **"Crear y enviar link"**.

Qué pasa después: el sistema crea la cuenta, le manda un correo de bienvenida ("¡Bienvenido a Renew Subastas! Creá tu contraseña") con un botón para que la persona configure su propia contraseña, y además te muestra el mismo enlace en pantalla con un botón **"Copiar"** — por si el correo no llega, se lo podés reenviar vos manualmente por WhatsApp o donde sea. El enlace es de un solo uso y personal.

Si el email ya existe, el sistema te avisa "Ya existe un usuario con ese email." en vez de crear un duplicado.

## 5. Gestionar usuarios existentes

Desde **Usuarios** (solo Admin), cada fila tiene un menú con:

- **Ver / editar**: abre la ficha completa, donde podés cambiar el **Tipo de cuenta** (Retail / Wholesale / Staff / Finanzas / Admin) y el **Estado** (Activo / Desactivado) con "Guardar cambios".
- **Generar link de reseteo**: crea un nuevo enlace para que la persona configure otra contraseña (por ejemplo, si perdió el correo original). Se copia solo al portapapeles.
- **Desactivar / Reactivar**: alterna el estado sin borrar nada.
- **Eliminar**: es un borrado _suave_ — desactiva la cuenta, pero el email queda reservado (nadie más se puede registrar con ese correo) y el historial de pujas/compras de esa persona queda intacto.
- **Eliminar definitivamente**: solo aparece sobre una cuenta que ya esté **Desactivada** y que no sea Admin. Borra la cuenta de verdad y libera el email para que se pueda usar de nuevo. Te pide escribir el email exacto de la persona para confirmar — si no coincide, se cancela con "El email no coincide. Cancelado." Las pujas, subastas y auditoría que mencionen a esa persona **no se borran**: quedan como historial, apuntando a una cuenta que ya no existe.

Protecciones automáticas que el sistema aplica sin que tengas que acordarte:

- **No podés desactivarte ni degradarte a vos mismo.**
- **Nunca se puede quedar la plataforma sin al menos un Admin activo** — si tu cambio dejaría cero admins activos, el sistema lo rechaza.
- **Cualquier cambio de rol, estado o segmento cierra la sesión de esa persona al instante.** No importa si estaba conectada en ese momento: la próxima acción que intente le va a pedir iniciar sesión de nuevo, ya con los permisos nuevos (o ninguno, si la desactivaste).
- Al reactivar a alguien que quedaba marcado como eliminado, el sistema también le devuelve el acceso a Firebase Auth (si solo tocaras el campo en la base de datos sin pasar por este botón, la persona seguiría sin poder entrar).

## 6. Solicitudes de recuperación de contraseña

Cuando un usuario toca "¿Olvidaste tu contraseña?" en el login, el pedido cae en **Contraseñas** (solo Admin), en la pestaña **"Pendientes"**, con el nombre, email y hora del pedido (y un aviso si la persona insistió varias veces).

Para atenderlo:

1. Tocá **"Generar link"**.
2. El sistema te muestra el enlace (válido 1 hora) y, si pudo, ya se lo mandó por correo directamente.
3. Tocá **"Copiar link"** si preferís mandárselo vos por otro medio.
4. Tocá **"Atendida"** para sacarlo de pendientes (pasa a la pestaña "Atendidas").

Si el pedido no corresponde (spam, error), tocá el ícono de basura para **descartarlo** sin generar ningún enlace.

## 7. Cargar un vehículo

Menú **"Mis vehículos"** (staff) o **"Vehículos"** (admin, mismo lugar) → **"Nuevo vehículo"** / **"Vehículo"**. Todos estos campos están en un único formulario:

| Campo                     | Detalle                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Audiencia**             | Retail (catálogo público) o Wholesale (solo mayoristas) — define quién va a poder ver este vehículo cuando salga a subasta |
| **Marca**, **Modelo**     | Obligatorios                                                                                                               |
| **Año**                   | Obligatorio                                                                                                                |
| **Número de chapa**       | Opcional, hasta 12 caracteres, se guarda en mayúsculas                                                                     |
| **VIN**                   | Opcional                                                                                                                   |
| **Kilometraje**           | Opcional, en km                                                                                                            |
| **Color**                 | Opcional                                                                                                                   |
| **Condición**             | Nuevo / Usado / Dañado                                                                                                     |
| **Transmisión**           | Manual / Automática / CVT                                                                                                  |
| **Combustible**           | Nafta / Diésel / Híbrido / Eléctrico                                                                                       |
| **Descripción (Español)** | Obligatoria — es lo que el comprador va a leer                                                                             |
| **Descripción (Inglés)**  | Opcional                                                                                                                   |
| **Fotos**                 | Hasta 20 imágenes; la primera que subas queda como foto principal                                                          |

Al guardar, el vehículo queda en estado **Borrador** — todavía no es visible para ningún comprador.

## 8. Publicar el vehículo: estados y transiciones

Un vehículo pasa por estos estados, en este orden:

```
Borrador → Listo → En subasta → Vendido
              ↕                    ↑
           (Borrador)         (o vuelve a "Listo"
                                si la subasta no
                                 termina en venta)
```

- **Borrador → Listo**: desde la ficha del vehículo, el botón **"Marcar como listo (publicable)"** aparece recién cuando cargaste al menos una foto. Un vehículo tiene que estar en **Listo** para poder crearle una subasta — si intentás crear una subasta sobre un vehículo que no está "Listo", el sistema la rechaza.
- **Listo → Borrador**: botón **"Volver a borrador"**, por si necesitás seguir editando antes de publicar.
- **Listo o Borrador → Archivado**: botón **"Archivar"** (con confirmación) — lo saca de los listados activos sin borrarlo.
- **Listo → En subasta**: pasa solo, automáticamente, en el momento en que creás una subasta con ese vehículo (sección 9).
- **En subasta → Vendido**: pasa solo cuando la subasta cierra con venta (por pujas, por Compra Ya, o porque marcaste VENDIDO por venta en salón).
- **En subasta → Listo**: pasa solo si la subasta se cancela, se elimina, termina sin pujas o sin alcanzar la reserva, o si una venta se libera por falta de pago (sección 15 y 17) — en todos esos casos el vehículo vuelve a estar disponible para una subasta nueva.

**Eliminar definitivamente** un vehículo (botón al pie de su ficha) solo está disponible en Borrador, Listo o Archivado — nunca mientras está En subasta o Vendido, porque esos estados tienen historia financiera atada. Te pide escribir **ELIMINAR** para confirmar y borra también todas las fotos.

Mientras un vehículo está **En subasta**, editar sus datos (marca, descripción, fotos, etc.) los cambia en vivo para los compradores que ya están mirando esa ficha — el formulario te lo advierte con un aviso ámbar: "Vehículo en subasta activa."

## 9. Crear una subasta

Menú **"Mis subastas"** / **"Subastas"** → **"Crear subasta"**. Solo vas a poder elegir vehículos en estado **Listo**; si no tenés ninguno, el sistema te lo dice directamente ("No tienes vehículos en estado 'Listo'. Marca uno como listo primero.") en vez de mostrarte un formulario vacío.

Campos del formulario:

| Campo                 | Qué es                                                                                                                    | Obligatorio                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Elegir vehículo**   | El vehículo en estado Listo que vas a subastar                                                                            | Sí                                       |
| **Precio inicial**    | El piso desde el que arrancan las pujas (o el precio que ve el comprador si nadie pujó todavía)                           | Sí — máximo USD 200.000                  |
| **Precio de reserva** | El mínimo real que Santa Rosa acepta — el comprador **nunca** lo ve (sección 10)                                          | No                                       |
| **Incremento mínimo** | Cuánto tiene que subir cada puja nueva sobre la anterior                                                                  | Sí — sugerido USD 500                    |
| **Inicio**            | Fecha y hora en que la subasta pasa a "En curso"                                                                          | Sí                                       |
| **Fin**               | Fecha y hora de cierre programado — si alguien puja sobre la hora, se extiende sola (ver "anti-sniping" en la sección 20) | Sí, al menos 1 minuto después del inicio |

**Importante: acá no se puede cargar el precio de Compra Ya.** Ese campo no existe en el formulario de creación — se agrega después, editando la subasta (sección 11).

La **audiencia** de la subasta (Retail o Wholesale) no se elige acá: la hereda automáticamente del vehículo que elegiste.

Al crear la subasta, el vehículo pasa a **"En subasta"** de inmediato. Si pusiste un **Inicio** en el pasado o "ahora", la subasta arranca **En curso** al toque; si es una fecha futura, queda **Programada** hasta esa hora.

## 10. Precio de reserva vs. precio de Compra Ya — la distinción que no podés confundir

Estos dos campos sirven para cosas completamente distintas, y el sistema los trata de forma distinta a propósito:

|                  | **Precio de reserva**                                                                                                                                                                            | **Precio de Compra Ya**                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Quién lo ve?    | **Nadie fuera de Admin/Staff/Finanzas.** El comprador jamás lo ve, ni en la ficha ni en ningún correo.                                                                                           | El comprador, mientras nadie haya pujado todavía.                                                                                                  |
| ¿Qué hace?       | Es el mínimo que Santa Rosa está dispuesta a aceptar. Si la subasta cierra sin que la mejor puja lo alcance, **no hay venta** (queda como "reserva no alcanzada", el vehículo vuelve a "Listo"). | Le permite al comprador **cerrar la compra al instante** por ese monto fijo, sin esperar el cierre — pero desaparece apenas entra la primera puja. |
| ¿Es obligatorio? | No — una subasta puede no tener reserva.                                                                                                                                                         | No — es opcional y aparte.                                                                                                                         |

**La regla que el sistema aplica sin excepción: el precio de Compra Ya siempre tiene que ser mayor al precio de reserva** (o, si no pusiste reserva, mayor al precio inicial). Si intentás guardar un Compra Ya igual o menor, el sistema te lo rechaza con:

- _"El precio de Compra ya debe ser mayor al precio objetivo."_ (cuando hay reserva)
- _"El precio de Compra ya debe ser mayor al precio inicial."_ (cuando no hay reserva)

**Por qué existe esta regla:** la reserva es el piso que decidiste que un vehículo no puede vender por debajo. Si Compra Ya pudiera estar en ese piso o por debajo, todo comprador racional usaría Compra Ya en vez de pujar — y estarías vendiendo, en los hechos, por debajo del mínimo que vos mismo fijaste. El sistema no te deja crear esa contradicción.

En la práctica, esto significa: pensá el precio de Compra Ya como "lo que cobrarías si alguien quiere saltarse la subasta y llevárselo ya" — siempre por encima de tu mínimo aceptable, nunca en él ni por debajo.

## 11. Agregar o cambiar el precio de Compra Ya después de crear la subasta

1. Abrí la subasta desde "Mis subastas" / "Subastas".
2. Tocá **"Editar"**. Esto solo está disponible mientras la subasta está **Programada** o **En curso**.
3. Con la subasta **Programada**, vas a ver el campo **"Precio Compra ya (USD, opcional)"** junto con el precio inicial, el incremento y la reserva — dejarlo vacío significa "sin Compra Ya". El mismo formulario te avisa en rojo si el valor que escribiste no supera la reserva, antes incluso de que intentes guardar.
4. Tocá **"Guardar cambios"**.

**Con la subasta ya En curso, el formulario de edición no te deja tocar el precio de Compra Ya** (ni ningún otro precio): el único campo editable en ese estado es la hora de cierre, y solo para **extenderla**, nunca para acortarla. Si necesitás agregar Compra Ya a una subasta, hacelo mientras todavía está Programada.

## 12. Editar una subasta: programada vs. en vivo

| Estado de la subasta       | Qué podés cambiar                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------- |
| **Programada**             | Todo: precio inicial, reserva, Compra Ya, incremento, fecha de inicio y de fin     |
| **En curso**               | Solo la fecha/hora de **fin**, y solo para **extenderla** (nunca para adelantarla) |
| **Finalizada / Cancelada** | Nada — es inmutable                                                                |

Esto es intencional: una vez que hay compradores pujando con un precio y unas reglas a la vista, cambiárselas por debajo sería injusto para quien ya pujó de buena fe. Por eso los precios quedan congelados apenas la subasta arranca.

Cada edición queda registrada en Auditoría con el antes y el después. Si cambiás un precio, además queda un registro visible en el **Reporte** de ese vehículo (sección 19), con quién lo cambió y cuándo.

## 13. Seguir una subasta en vivo y el panel de Pujas

**Desde la ficha de la subasta** (Mis subastas → tocar una), ves en tiempo real la puja actual, la hora de cierre y el historial completo de pujas de esa subasta puntual.

**Desde el menú "Pujas"** (solo Admin y Staff — Finanzas no llega a esta pantalla) tenés la actividad de **todas** las subastas juntas, en vivo:

- Tres números arriba: **Pujas hoy**, **Pujadores activos** y **Avisos fallidos** (este último se pone en rojo si hay alguno).
- Una lista de las últimas pujas, con quién pujó, cuánto y hace cuánto. Tocando una puja se despliega el email y teléfono de quien pujó, y un enlace **"Ver historial →"** con todo lo que esa persona pujó en la plataforma.
- Al lado de cada puja que desplazó a otra, un indicador de si el correo de "Te superaron" se **envió**, se **omitió** (por ejemplo, la persona desactivó ese aviso) o **falló** de verdad — así detectás rápido si hay un problema de entrega de correos.

**La campanita 🔔 de la barra superior** es distinta de esta pantalla, y para Admin, Staff **y también Finanzas** avisa en el momento de cada puja nueva en toda la plataforma (monto y comprador, sin teléfono ni historial). Es, de hecho, la **única** forma en que a Finanzas le llega actividad de pujas en vivo, ya que no puede abrir la pantalla completa de "Pujas". Admin, además, recibe ahí mismo cada solicitud nueva de recuperación de contraseña. (Para un comprador la misma campanita muestra otra cosa — subastas nuevas de su segmento y avisos de "Ganaste"; ver el manual del comprador.)

## 14. Marcar VENDIDO — venta en el salón

Usalo cuando alguien compra un vehículo presencialmente en el local **mientras** su subasta sigue publicada — para que la plataforma deje de aceptar pujas por algo que ya no está disponible.

Disponible desde la ficha de la subasta (botón **"Marcar vendido"**), para Admin y Staff, mientras el estado sea **Programada** o **En curso** (no se puede sobre una subasta ya finalizada).

Pasos:

1. Tocá **"Marcar vendido"**. Se abre el diálogo **"Marcar VENDIDO"**: _"Registrá la venta de esta unidad fuera de la plataforma (venta en salón). Cierra la subasta de inmediato y no se puede deshacer."_
2. Si la subasta ya tenía pujas, ves una advertencia ámbar: _"Esta subasta tiene N pujas activas. Al marcarla vendida, se les avisa por correo que la unidad se vendió en salón."_
3. Cargá el **Precio real de venta (USD)** — el precio al que realmente se vendió en el salón. Este número **no lo ve nunca el comprador**; queda guardado como dato interno para reportes, junto con quién lo marcó y cuándo.
4. Escribí **VENDIDO** en el campo de confirmación.
5. Tocá **"Marcar vendido"**.

Qué pasa al instante:

- La subasta cierra (queda "Finalizada") y el vehículo pasa a **Vendido**.
- **Todos** los que habían pujado en esa subasta — no solo el que iba primero — reciben un correo: _"Subasta finalizada · {vehículo}"_, avisándoles que se vendió en el salón y que su puja no les genera ningún cargo.
- En el catálogo y la ficha públicos aparece el mismo cartel rojo **VENDIDO** que se ve en una venta normal de la plataforma — el comprador no puede distinguir desde afuera cuál de los dos pasó.
- Esta venta **no entra en Ventas ni en el GMV** del panel de Admin: no hubo puja ganadora, seña ni comprobante que gestionar, y contarla ahí mezclaría dos cosas distintas.
- No se puede deshacer, ni eliminar esa subasta después (sección 16): el registro de que se vendió en salón es la única prueba de esa venta, y el sistema la protege de un borrado accidental.

## 15. Cómo cierran solas las subastas

Un proceso automático revisa **todas las subastas cada 1 minuto** y hace, en orden:

1. **Promueve** las subastas Programadas cuya hora de inicio ya llegó → pasan a En curso.
2. **Cierra** las subastas En curso cuya hora de cierre ya pasó, y decide el resultado:
   - **Vendida**: hubo pujas y la mejor supera la reserva (o no había reserva) → se adjudica al mejor postor, se calcula la seña y el plazo de pago, y arranca el proceso de cobro (sección 17).
   - **Reserva no alcanzada**: hubo pujas, pero ninguna llegó al precio de reserva → no hay venta, el vehículo vuelve a "Listo".
   - **Sin pujas**: nadie pujó → no hay venta, el vehículo vuelve a "Listo".
3. **Libera** las adjudicaciones vendidas cuyo plazo de pago ya venció sin que se haya confirmado la seña → pasan a "forfeited" (liberada) y el vehículo vuelve a "Listo" (sección 17).

Por este mecanismo de "cada 1 minuto" puede pasar que una subasta ya haya terminado su cronómetro pero la pantalla tarde hasta 60 segundos en reflejar el estado "Finalizada". Esto no es una falla ni una ventana para colarse: el sistema deja de aceptar pujas nuevas en el instante exacto en que se cumple la hora, sin importar cuándo se actualice la etiqueta visual.

## 16. Cancelar vs. Eliminar una subasta

Son dos acciones distintas, con reglas distintas — no las uses como sinónimos:

|                                                 | **Cancelar**                                             | **Eliminar**                                                                     |
| ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ¿Cuándo se puede?                               | Programada o En curso                                    | Programada, Cancelada, En curso sin ninguna puja todavía, o Finalizada sin venta |
| ¿Se puede sobre una venta (plataforma o salón)? | No                                                       | **Nunca, bajo ninguna circunstancia**                                            |
| ¿Qué pasa con las pujas?                        | Quedan en el historial, pero la subasta no tiene ganador | Se borran junto con la subasta                                                   |
| ¿Qué pasa con el vehículo?                      | Vuelve a "Listo" (si estaba en subasta)                  | Vuelve a "Listo" (si estaba en subasta)                                          |
| ¿Se puede deshacer?                             | No                                                       | No                                                                               |

Usá **Cancelar** cuando la subasta en sí no debería seguir corriendo (por ejemplo, se encontró un problema con el vehículo) pero querés conservar el historial de pujas que ya tuvo. Usá **Eliminar** para limpiar una subasta mal cargada por error que todavía no generó ninguna venta.

Sobre una subasta **En curso con pujas**, el sistema no te deja eliminarla directamente — primero tenés que **Cancelarla**, y recién después eliminarla si hace falta.

## 17. Confirmar la seña recibida o liberar la adjudicación

Estos dos botones solo los ve **Admin** y **Finanzas** (Staff no, aunque haya sido quien cargó la subasta) — aparecen en la ficha de cualquier subasta que se vendió _en la plataforma_ (no en subastas vendidas en salón, que no tienen seña que gestionar).

**Confirmar seña recibida** — usalo cuando ya verificaste que la transferencia del comprador llegó:

1. Tocá **"Confirmar seña recibida"**.
2. Confirmá el diálogo ("¿Confirmar seña recibida? Esta acción queda asentada en el audit log.").
3. Opcional: agregá una referencia (número de transferencia, fecha, etc.).

Al confirmar: el estado pasa a **Seña confirmada**, el comprador recibe un correo de confirmación, y el equipo de ventas de Santa Rosa recibe automáticamente un aviso interno con todos los datos del comprador y del vehículo para avanzar con la facturación — no hace falta que se lo reenvíes vos a mano.

**Liberar adjudicación** — usalo para cortar manualmente una venta pendiente antes de que se cumpla el plazo automático (por ejemplo, el comprador te avisó personalmente que ya no va a pagar):

1. Tocá **"Liberar adjudicación"**.
2. Confirmá el diálogo, con un motivo opcional.

Al liberar: el estado pasa a **Liberada (forfeited)** y el vehículo vuelve a "Listo" para poder subastarse de nuevo. Es exactamente lo mismo que pasa automáticamente cuando se cumple el plazo sin pago (sección 15), solo que decidido por vos antes de tiempo.

Ambas acciones son **idempotentes**: si volvés a confirmar un estado que ya estaba confirmado, no pasa nada (no se manda un segundo correo ni se rompe nada).

## 18. El panel de Ventas

Menú **"Ventas"** (Admin y Finanzas). Es una lista en vivo de **todas las subastas vendidas en la plataforma** — se actualiza sola apenas se cierra una venta nueva, sin recargar la página. Deliberadamente **no incluye** las ventas marcadas VENDIDO en salón (sección 14): esas no tienen seña ni comprador que gestionar acá.

Cada fila muestra el vehículo, el precio final, el monto de la seña, el nombre del comprador ganador y un indicador de estado de pago (**Pendiente de seña** / **Seña confirmada** / **Liberada**). Tocando **"Ver detalle"** vas a la ficha completa de esa subasta, donde están los botones de confirmar/liberar (sección 17).

Nota de privacidad: cuando Finanzas necesita el nombre, email o teléfono de un comprador, el sistema se lo resuelve solo para compradores que **efectivamente ganaron** una subasta — Finanzas no tiene forma de buscar o listar los datos de compradores que no ganaron nada.

## 19. Reporte: insights por vehículo y tráfico del sitio

Menú **"Reporte"** (Admin y Staff). Tiene dos partes.

**Tráfico del sitio** (arriba de todo): cuántas visitas y sesiones tuvo el sitio hoy (número parcial, el día sigue en curso) y, a partir del día siguiente al primer despliegue, el historial de días anteriores con:

- Un gráfico de visitas y sesiones por día.
- De dónde vienen los visitantes anónimos (fuente de tráfico).
- Dos embudos **separados** — uno para visitantes anónimos (cuántos entran a la portada y cuántos de esos llegan a intentar iniciar sesión) y otro para compradores con sesión iniciada (cuántos ven el catálogo y cuántos abren una ficha de vehículo). Son poblaciones distintas y el panel nunca mezcla sus porcentajes.

**Por vehículo** (lista debajo): cada vehículo publicado, con vistas únicas y totales, cuántas bajas de precio tuvo, precio actual y hace cuántos días está publicado — con una alerta visual a partir de los **7 días** sin venderse. Tocando uno entrás al detalle con:

- **Movimientos de precio**: cada cambio de precio inicial o de reserva, quién lo hizo y cuándo.
- **Quiénes lo miraron**: qué compradores abrieron esa ficha, cuántas veces y cuándo fue la última.
- **Subastas**: el historial de subastas que tuvo ese vehículo, con vistas y resultado de cada una.

## 20. Configuración global

Menú **"Configuración"** (solo Admin). Es una única pantalla larga con estas secciones, en orden:

**Datos de la empresa** — razón social, RUC, domicilio legal, correo y teléfono de contacto legal. Se usan en la política de privacidad, los términos y condiciones y el pie de página públicos.

**Moneda** — moneda primaria (USD o PYG), si mostrar una conversión secundaria, y el tipo de cambio Gs./USD (lo usa, entre otras cosas, la calculadora de cuotas del comprador).

**Pujas**:

- **Incremento fijo (USD)**: un valor de referencia general. Cada subasta igual define su propio incremento al crearla o editarla (sección 9) — este campo no lo sobrescribe.
- **Permitir incremento manual**: si está activado, el comprador ve un campo para escribir cualquier monto además de los tres botones rápidos.
- **Anti-sniping (segundos)**: cuánto se extiende el cierre cuando entra una puja sobre la hora (por default, 60 segundos). El tope de 30 minutos totales de extensión por subasta es fijo y no se configura desde acá.

**Financiación / Cuotero** — activar o no la calculadora de cuotas del comprador, los plazos permitidos en meses, la tasa de interés anual, el porcentaje de entrega inicial sugerido, el monto mínimo financiable y las notas legales. **Viene desactivada por default** — si el comprador no ve la calculadora en una ficha, revisá acá primero.

**Emails** — el dominio que deben usar los correos de admin/staff/finanzas, y el remitente (dirección y nombre) de los correos que manda la plataforma.

**Pago y seña** — los datos bancarios que se le muestran al ganador de una subasta (cuenta en USD y, aparte, cuenta en guaraníes), el **porcentaje de seña** sobre el precio final (por default 10%) y el **plazo en horas** para pagarla (por default 24, configurable de 1 a 168 horas — una semana). También instrucciones adicionales en texto libre y el contacto de soporte. Mientras estos datos bancarios estén vacíos, el comprador ganador va a leer que "Santa Rosa Paraguay SA se va a contactar con vos" en lugar de un número de cuenta vacío — nunca se manda un correo con una plantilla a medio llenar.

Cualquier cambio acá impacta **en toda la plataforma** de inmediato — no hace falta volver a publicar nada.

## 21. Auditoría

Menú **"Auditoría"** (solo Admin). Registro de acciones administrativas con fecha, quién la hizo, qué acción fue y sobre qué recurso — filtrable por tipo de acción. Es de solo lectura: nada se puede borrar ni editar desde acá. Además de las acciones sobre usuarios listadas en el filtro, también quedan registradas ahí (aunque no aparezcan en la lista de filtros) todas las acciones sobre subastas: crearlas, editarlas, cancelarlas, eliminarlas, marcarlas VENDIDO, confirmar una seña o liberar una adjudicación.

## 22. Tabla resumen de permisos

| Pantalla / acción                                         |          Admin           |                   Staff                    | Finanzas |
| --------------------------------------------------------- | :----------------------: | :----------------------------------------: | :------: |
| Crear / editar vehículos                                  |            Sí            |                     Sí                     |    No    |
| Crear / editar / cancelar / eliminar subastas             |            Sí            |                     Sí                     |    No    |
| Marcar VENDIDO (venta en salón)                           |            Sí            |                     Sí                     |    No    |
| Ver precio de reserva en pantalla                         | Sí (editando la subasta) |          Sí (editando la subasta)          |   No\*   |
| Confirmar seña / liberar adjudicación                     |            Sí            |                     No                     |    Sí    |
| Panel de Ventas                                           |            Sí            |                     No                     |    Sí    |
| Panel de Pujas (actividad en vivo)                        |            Sí            |                     Sí                     |    No    |
| Reporte (insights + tráfico)                              |            Sí            |                     Sí                     |    No    |
| Crear usuarios                                            |      Cualquier rol       | Retail/Wholesale/Staff/Finanzas (no Admin) |    No    |
| Editar rol / estado de usuarios, eliminar definitivamente |            Sí            |                     No                     |    No    |
| Cola de recuperación de contraseña                        |            Sí            |                     No                     |    No    |
| Auditoría                                                 |            Sí            |                     No                     |    No    |
| Configuración global                                      |            Sí            |                     No                     |    No    |

\* Finanzas no tiene ninguna pantalla que muestre el precio de reserva — no llega al formulario de edición de subastas, y la ficha de "Pago y seña" que sí ve no lo incluye. (A nivel de permisos de base de datos el rol finanzas está habilitado para leerlo, igual que admin y staff, pero eso no se traduce en ninguna pantalla real donde lo vea.)

## 23. Errores comunes a evitar

- **No confundas el precio de reserva con el de Compra Ya.** El primero es secreto y protege tu mínimo; el segundo es público y tiene que superar al primero siempre (sección 10).
- **No esperes poder cargar Compra Ya al crear la subasta** — ese campo aparece recién al editarla, y solo mientras sigue Programada (sección 11).
- **No intentes cambiar precios de una subasta ya En curso** — el sistema solo te va a dejar extender la hora de cierre.
- **No uses Eliminar para "deshacer" una venta** — no se puede, ni en plataforma ni en salón. Si una venta fue un error, la vía es liberar la adjudicación (seña) o, para una venta en salón, corregirlo por fuera del sistema con soporte técnico.
- **No olvides marcar VENDIDO apenas se venda algo en el salón** mientras su subasta sigue publicada — si no lo hacés, algún comprador puede terminar "ganando" en la plataforma un vehículo que ya no existe para vender.
- **Recordá que Staff no puede confirmar señas ni liberar adjudicaciones** — esas acciones necesitan a un Admin o a Finanzas, aunque Staff sea quien esté siguiendo esa venta de cerca.
