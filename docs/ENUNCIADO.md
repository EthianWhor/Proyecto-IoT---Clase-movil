# Evaluación Parcial de Desarrollo Móvil (V2): Sistema de Detección de Intrusos IoT (ESP32-S3 CAM & Mobile Integration)

## 1\. Contexto y Propósito del Proyecto

Este proyecto evalúa la competencia integral del estudiante en el desarrollo de sistemas ciberfísicos, uniendo hardware embebido de bajo costo con aplicaciones móviles de alta fiabilidad. El reto consiste en configurar un microcontrolador **ESP32-S3 CAM** para que actúe de manera autónoma como punto de acceso y servidor web de streaming de video, integrándose con una aplicación móvil encargada de la monitorización en tiempo real, programación de franjas horarias de seguridad y despacho automatizado de alertas ante intrusiones.

La arquitectura exige un dominio profundo de redes de computadoras (protocolos HTTP, TCP/UDP, MJPEG / WebSockets), gestión de hilos en segundo plano y manejo de restricciones de hardware móvil.

---

## 2\. Módulos y Requisitos Técnicos Obligatorios

### Módulo 1: Configuración de Hardware Embebido (ESP32-S3 CAM)

* **Modo Servidor y AP / Router:** Programación del microcontrolador en C/C++ (ESP-IDF o Arduino IDE) para operar como servidor autónomo capaz de inicializar el sensor de cámara, capturar fotogramas a tasa constante y transmitirlos mediante flujos de video ligeros (MJPEG o WebSockets).  
* **Lógica de Detección Local:** Implementación de rutinas de procesamiento básico de imagen o lectura de sensores adicionales conectados al microcontrolador para identificar movimiento sospechoso.

### Módulo 2: Aplicación Móvil \- Streaming y Concurrencia

* **Visor de Video en Tiempo Real:** Interfaz móvil optimizada para establecer conexión directa con el stream de video del ESP32-S3 CAM con la menor latencia posible, gestionando reconexiones automáticas ante interrupciones de la señal Wi-Fi.  
* **Gestión de Ciclo de Vida y Background Services:** Manejo robusto de servicios en primer plano (*Foreground Services*) y notificaciones persistentes en Android / iOS para asegurar que la app mantenga la supervisión del estado de seguridad incluso cuando se encuentra en segundo plano.

### Módulo 3: Automatización, Franjas Horarias y Alertas Críticas

* **Configuración de Horarios de Vigilancia:** Módulo en la app para programar franjas horarias o activar/desactivar manualmente el modo "Fuera de casa" (Armado del sistema).  
* **Disparo de Alertas Automatizadas:** Cuando el sistema detecta movimiento dentro de una franja horaria activa, se debe disparar una rutina que envíe un correo electrónico de alerta inmediata con evidencia fotográfica o marca temporal exacta al propietario del espacio vigilado.

---

## 3\. Metodología de Evaluación y Defensa Técnica (Sostenibilidad del Código)

La calificación final de este proyecto no depende exclusivamente de la demostración del hardware funcionando. Cada grupo deberá someterse a una **evaluación de defensa presencial individual y grupal** bajo las siguientes normativas:

* **Dinámica de Preguntas Aleatorias:** El docente seleccionará **5 preguntas de manera totalmente aleatoria** dirigidas a miembros específicos del equipo. Las preguntas son nominales; ningún integrante puede responder en representación de otro compañero.  
* **Escala de Calificación por Pregunta:** Cada interrogante se califica bajo una escala rigurosa con impacto directo sobre la nota final del parcial:  
  1. **No supo responder (0% de nota):** El estudiante desconoce por completo la lógica de programación del ESP32, los sockets de red utilizados, el manejo de hilos en la app o la integración del servicio de correo.  
  2. **Respondió parcialmente (50% de nota):** El estudiante comprende el funcionamiento general del sistema físico o el código móvil, pero carece de claridad técnica sobre la gestión de concurrencia, el manejo de excepciones de red o la optimización del búfer de video.  
  3. **Respondió perfecto (100% de nota):** El estudiante explica con fluidez técnica la arquitectura de red embebida-móvil, justifica el manejo de flujos asíncronos, detalla el tratamiento de estados del hardware y rebate con propiedad las contrapreguntas del profesor.  
* **Impacto Global en la Nota:** Las 5 preguntas aleatorias dictaminan de forma decisiva la nota definitiva del parcial. Un montaje de hardware impecable con deficiencias evidentes en la sustentación oral por parte de sus integrantes sufrirá una penalización drástica en su calificación.