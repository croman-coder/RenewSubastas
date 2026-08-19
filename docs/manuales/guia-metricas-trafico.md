# Guía de métricas de tráfico — Renew Subastas

Para el equipo de subastas. Explica qué mide cada número del panel
`/staff/insights`, sobre qué período, y qué significan **Directo** y **Otro**
en Orígenes.

Todo lo de acá está verificado contra el código que produce los números
(`functions/src/insights/`), no contra lo que parecería razonable.

---

## 1. Tres palabras distintas: Visita, Sesión, Persona

Esta es la confusión de fondo. No son sinónimos y ninguna de las tres es
exactamente "cuánta gente entró".

| Palabra     | Qué es                    | Cómo lo cuenta el sistema                                                |
| ----------- | ------------------------- | ------------------------------------------------------------------------ |
| **Visita**  | Una pantalla abierta      | Cada vez que alguien abre una página. Si mira 5 autos, son 5 visitas     |
| **Sesión**  | Una pestaña del navegador | Un identificador que se crea al abrir la pestaña y **muere al cerrarla** |
| **Persona** | Un ser humano             | **No se mide.** A propósito — ver §4                                     |

Regla que siempre se cumple: **Visitas ≥ Sesiones**. Si ves 300 visitas y 80
sesiones, es que en promedio cada pestaña miró unas 4 pantallas.

## 2. Ejemplo concreto

María ve un anuncio en Instagram el martes a la mañana:

1. Toca el anuncio → se abre la home → **1 visita, 1 sesión nueva**
2. Entra al catálogo → **2 visitas**, la misma sesión
3. Abre 3 autos → **5 visitas**, la misma sesión
4. Cierra la pestaña y se va a almorzar
5. A la tarde vuelve, escribe la dirección → **6 visitas, 2ª sesión**

Total del martes por María: **6 visitas, 2 sesiones, 1 persona.**

El panel va a decir 6 y 2. Nunca va a decir 1.

## 3. Qué período muestra cada número

| Bloque                             | Período                            | Cuándo se actualiza                    |
| ---------------------------------- | ---------------------------------- | -------------------------------------- |
| **Visitas hoy** / **Sesiones hoy** | El día de hoy, hora Paraguay       | **En vivo.** Sube mientras mirás       |
| Días anteriores, orígenes, embudos | Hasta los últimos 30 días cerrados | Se calcula **a las 9:30 de la mañana** |

Dos consecuencias prácticas:

- **"Hoy" siempre está incompleto.** A las 10 de la mañana muestra lo que pasó
  hasta las 10. No lo compares con un día entero.
- **El día de ayer recién aparece después de las 9:30 de hoy.** Si entrás a las
  8 de la mañana buscando el resumen de ayer, todavía no está.

## 4. Por qué "sesiones" no es "personas"

La sesión vive en la pestaña y muere con ella. Eso hace que:

- La **misma persona que vuelve mañana** cuenta como sesión nueva.
- La **misma persona en el celular y en la compu** cuenta como dos.
- Dos pestañas abiertas a la vez cuentan como dos.

Es una decisión deliberada, no una limitación técnica: para saber que sos la
misma persona que ayer habría que ponerte una cookie de seguimiento, y eso
obliga a pedir consentimiento. Si midiéramos sólo a quien acepta el cartel de
cookies, perderíamos justo a una parte del tráfico de anuncios — que es el que
interesa medir.

**Cómo usarlo entonces:** las sesiones sirven para **comparar** (¿esta semana
entró más gente que la anterior? ¿el día que publicamos rindió más?), no como
padrón de personas. La tendencia es confiable; el número absoluto es una cota
alta.

## 5. Los dos embudos, y por qué están separados

| Embudo         | Qué muestra      | Por qué va aparte                                               |
| -------------- | ---------------- | --------------------------------------------------------------- |
| **Anónimos**   | Inicio → Login   | Gente sin cuenta. Sólo puede ver la home y el login             |
| **Con sesión** | Catálogo → Ficha | Compradores ya logueados. El catálogo y las fichas piden cuenta |

Están separados porque **son públicos distintos**. Mezclarlos daría un embudo
mentiroso: el catálogo nunca podría "convertir" desde la home, porque para ver
el catálogo primero hay que iniciar sesión.

Ambos cuentan **sesiones distintas**, no visitas. Una sesión que abrió 8 autos
suma **1** en Ficha, no 8.

## 6. Orígenes: de dónde vino cada visita

El sistema clasifica cada visita en **cinco** categorías y nada más. Se fija en
dos cosas, en este orden:

1. La **etiqueta de campaña** en el enlace (`utm_source`), si la tiene.
2. Si no tiene, el **sitio anterior** desde donde se hizo clic.

| Origen        | Qué cae ahí                                                       |
| ------------- | ----------------------------------------------------------------- |
| **Instagram** | Enlaces etiquetados `ig`/`instagram`, o clics desde instagram.com |
| **Facebook**  | Enlaces etiquetados `fb`/`facebook`, o clics desde facebook.com   |
| **Google**    | Enlaces etiquetados `google`, o clics desde google.com            |
| **Directo**   | Ni etiqueta ni sitio anterior — ver §7                            |
| **Otro**      | Había un origen, pero no es ninguno de los tres — ver §8          |

## 7. DIRECTO — "llegó sin dejar rastro"

Cae en Directo cuando la visita **no trae etiqueta de campaña ni sitio
anterior**. Los casos reales:

- Escribió `renewsubastas.com.py` a mano, o entró desde favoritos.
- **Tocó un enlace en WhatsApp.** ← el caso más frecuente en Paraguay
- Abrió el enlace desde un mensaje directo de Instagram.
- Escaneó un QR de un cartel o un folleto.
- Tocó un enlace en un correo.

> **Lo importante:** _Directo_ **no** quiere decir "ya nos conocía". WhatsApp,
> los mensajes directos y los QR no le avisan al sitio de dónde vino, así que
> todo eso aterriza acá. Si están difundiendo por WhatsApp, buena parte de ese
> trabajo está contado en Directo y no en otro lado.

## 8. OTRO — "vino de algún lado, pero no de los tres grandes"

Cae en Otro cuando **sí había un origen** pero no es Instagram, Facebook ni
Google:

- Un clic desde **otra página web** (un portal, un blog, un listado).
- Un buscador que no es Google (Bing, DuckDuckGo).
- Un enlace con una **etiqueta de campaña distinta** — por ejemplo
  `utm_source=tiktok` o `utm_source=newsletter`.
- Un enlace con la etiqueta **mal escrita**: `utm_source=Instagram-stories`
  no entra en Instagram, entra en Otro.

> **Si Otro crece mucho, algo hay que mirar.** Casi siempre es una campaña
> etiquetada con un nombre que el sistema no reconoce. Se arregla usando
> exactamente `ig`, `fb` o `google` en la etiqueta del enlace.

## 9. Cómo leerlo para decidir

- **¿Rindió la campaña?** Mirá Instagram/Facebook en Orígenes contra los días
  previos. Si subieron las sesiones de esa fuente, llegó gente.
- **¿La gente entra pero no se registra?** Embudo de Anónimos: si Inicio es
  alto y Login bajo, el problema está en la home, no en el anuncio.
- **¿Miran autos pero no pujan?** Embudo Con sesión: muchas Fichas y pocas
  pujas es un tema de precio o de confianza, no de tráfico.
- **¿Directo muy alto?** Probablemente sea difusión por WhatsApp. Para
  separarlo, mandá el enlace con `?utm_source=whatsapp` y va a dejar de
  mezclarse con el resto (va a aparecer en Otro, ya identificable).

## 10. Lo que este panel NO mide

Para que nadie le pida algo que no puede dar:

- **No dice quién** entró. Es anónimo por diseño: no guarda nombre, correo, IP
  ni nada que identifique a una persona.
- **No sigue a la misma persona entre días.**
- **No mide qué auto miró cada quien** — sólo cuántas fichas se abrieron en
  total.
- **No cuenta robots.** Se filtran antes de contar, así que los números son de
  gente real (para eso están).
