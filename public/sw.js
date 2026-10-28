/*
 * Service worker de los avisos push al personal. Solo hace dos cosas: mostrar el aviso cuando llega (un cliente
 * autorizó o rechazó un trabajo) y abrir la orden al tocarlo. No guarda nada en caché: la app siempre lee lo último.
 */
self.addEventListener("push", (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = {};
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo || "Servitecas", {
      body: datos.cuerpo || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: datos.tag,
      data: { url: datos.url || "/inicio" },
    })
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = (evento.notification.data && evento.notification.data.url) || "/inicio";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ("focus" in v) {
          v.navigate(url);
          return v.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
