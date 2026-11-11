package expo.modules.beeusbserial

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * A porta serial USB (CDC-ACM) do próprio aparelho Android, para a coleta pelo cabo
 * (feature 006, specs/006-cabo-android/plan.md D-601 a D-606).
 *
 * Só fala com a placa (fabricante Espressif, VID 0x303A). Configura 115200 8N1 com
 * SET_LINE_CODING e NUNCA manda SET_CONTROL_LINE_STATE: no ESP32-C6, os sinais DTR/RTS
 * podem reiniciar o chip (D-602). A leitura roda numa thread própria e cada pedaço chega
 * ao JS pelo evento `onDados`, em base64. Quando a placa some (dormiu, cabo solto), sai
 * `onFim` e a conexão é fechada.
 */
class BeeUsbSerialModule : Module() {
  private class Conexao(
    val dispositivo: UsbDevice,
    val conexao: UsbDeviceConnection,
    val interfaces: List<UsbInterface>,
    val entrada: UsbEndpoint,
    val saida: UsbEndpoint,
  ) {
    val aberta = AtomicBoolean(true)
    var leitor: Thread? = null
  }

  private val conexoes = ConcurrentHashMap<Int, Conexao>()
  private val proximaAlca = AtomicInteger(1)

  private val contexto: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_SEM_CONTEXTO", "Sem contexto do Android", null)

  private val usb: UsbManager
    get() = contexto.getSystemService(Context.USB_SERVICE) as UsbManager

  private fun placas(): List<UsbDevice> = usb.deviceList.values.filter { it.vendorId == VID_ESPRESSIF }

  override fun definition() = ModuleDefinition {
    Name("BeeUsbSerial")
    Events("onDados", "onFim")

    // As placas ligadas agora. `permitida`: o Android já deixou o app usar esta.
    Function("listar") {
      placas().map {
        mapOf(
          "nome" to it.deviceName,
          "vid" to it.vendorId,
          "pid" to it.productId,
          "permitida" to usb.hasPermission(it),
        )
      }
    }

    // Abre o diálogo de permissão do Android. Resolve true/false, nunca rejeita.
    AsyncFunction("pedirPermissao") { nome: String, promise: Promise ->
      val dispositivo = usb.deviceList[nome]
      if (dispositivo == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      if (usb.hasPermission(dispositivo)) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val ctx = contexto
      val acao = "${ctx.packageName}.USB_PERMISSAO"
      val respondida = AtomicBoolean(false)
      val handler = Handler(Looper.getMainLooper())
      lateinit var receptor: BroadcastReceiver
      val concluir = { ok: Boolean ->
        if (respondida.compareAndSet(false, true)) {
          try { ctx.unregisterReceiver(receptor) } catch (_: Exception) {}
          promise.resolve(ok)
        }
      }
      receptor = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          if (intent.action != acao) return
          val ok = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
          concluir(ok || usb.hasPermission(dispositivo))
        }
      }
      val filtro = IntentFilter(acao)
      if (Build.VERSION.SDK_INT >= 33) {
        ctx.registerReceiver(receptor, filtro, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        ctx.registerReceiver(receptor, filtro)
      }
      val flags = if (Build.VERSION.SDK_INT >= 31) {
        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
      val pendente = PendingIntent.getBroadcast(ctx, 0, Intent(acao).setPackage(ctx.packageName), flags)
      usb.requestPermission(dispositivo, pendente)
      // Rede de segurança: se a resposta não chegar, vale o que o Android disser depois.
      handler.postDelayed({ concluir(usb.hasPermission(dispositivo)) }, 60_000)
    }

    // Abre a placa já permitida e devolve a alça da conexão.
    AsyncFunction("abrir") { nome: String ->
      val dispositivo = usb.deviceList[nome]
        ?: throw CodedException("ERR_SEM_PLACA", "A placa não está ligada", null)
      if (!usb.hasPermission(dispositivo)) {
        throw CodedException("ERR_SEM_PERMISSAO", "Sem permissão de USB", null)
      }
      var dados: UsbInterface? = null
      var controle: UsbInterface? = null
      var entrada: UsbEndpoint? = null
      var saida: UsbEndpoint? = null
      for (i in 0 until dispositivo.interfaceCount) {
        val itf = dispositivo.getInterface(i)
        when (itf.interfaceClass) {
          UsbConstants.USB_CLASS_COMM -> if (controle == null) controle = itf
          UsbConstants.USB_CLASS_CDC_DATA -> if (dados == null) {
            var e: UsbEndpoint? = null
            var s: UsbEndpoint? = null
            for (k in 0 until itf.endpointCount) {
              val ep = itf.getEndpoint(k)
              if (ep.type != UsbConstants.USB_ENDPOINT_XFER_BULK) continue
              if (ep.direction == UsbConstants.USB_DIR_IN) e = ep else s = ep
            }
            if (e != null && s != null) { dados = itf; entrada = e; saida = s }
          }
        }
      }
      if (dados == null || entrada == null || saida == null) {
        throw CodedException("ERR_NAO_E_SERIAL", "A placa não tem porta serial USB", null)
      }
      val conexao = usb.openDevice(dispositivo)
        ?: throw CodedException("ERR_ABRIR", "O Android não abriu a placa", null)
      val presas = mutableListOf<UsbInterface>()
      for (itf in listOfNotNull(controle, dados)) {
        if (conexao.claimInterface(itf, true)) presas.add(itf)
      }
      if (!presas.contains(dados)) {
        conexao.close()
        throw CodedException("ERR_ABRIR", "A porta serial da placa está ocupada", null)
      }
      // SET_LINE_CODING: 115200 bps, 1 bit de parada, sem paridade, 8 bits. Não mexe em DTR/RTS.
      if (controle != null) {
        val b = 115200
        val linha = byteArrayOf(
          (b and 0xff).toByte(), ((b shr 8) and 0xff).toByte(),
          ((b shr 16) and 0xff).toByte(), ((b shr 24) and 0xff).toByte(),
          0, 0, 8,
        )
        val r = conexao.controlTransfer(0x21, 0x20, 0, controle.id, linha, linha.size, 1000)
        Log.i(TAG, "abrir: SET_LINE_CODING 115200 8N1 -> $r")
      }
      val alca = proximaAlca.getAndIncrement()
      val c = Conexao(dispositivo, conexao, presas, entrada, saida)
      conexoes[alca] = c
      Log.i(TAG, "abrir: alca=$alca ${dispositivo.deviceName} serie=${try { dispositivo.serialNumber } catch (_: Exception) { "?" }} " +
        "interfaces presas=${presas.map { it.id }} entrada=0x${Integer.toHexString(entrada.address)} saida=0x${Integer.toHexString(saida.address)}")
      c.leitor = Thread({ ler(alca, c) }, "bee-usb-serial-$alca").apply { isDaemon = true; start() }
      alca
    }

    AsyncFunction("escrever") { alca: Int, base64: String ->
      val c = conexoes[alca] ?: throw CodedException("ERR_FECHADA", "Conexão fechada", null)
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      var enviados = 0
      while (enviados < bytes.size) {
        // Sem o bulkTransfer com deslocamento (só Android 9+): manda o trecho que falta.
        val trecho = if (enviados == 0) bytes else bytes.copyOfRange(enviados, bytes.size)
        val n = c.conexao.bulkTransfer(c.saida, trecho, trecho.size, 2000)
        Log.i(TAG, "escrever: alca=$alca pedidos=${trecho.size} aceitos=$n \"${visivel(trecho, trecho.size)}\"")
        if (n <= 0) {
          fechar(alca, "escrever")
          throw CodedException("ERR_CAIU", "A placa não recebeu", null)
        }
        enviados += n
      }
    }

    AsyncFunction("fechar") { alca: Int -> fechar(alca, null) }

    OnDestroy {
      for (alca in conexoes.keys.toList()) fechar(alca, null)
    }
  }

  private fun ler(alca: Int, c: Conexao) {
    val buffer = ByteArray(4096)
    while (c.aberta.get()) {
      val n = c.conexao.bulkTransfer(c.entrada, buffer, buffer.size, 200)
      if (n > 0) {
        Log.i(TAG, "ler: alca=$alca $n bytes \"${visivel(buffer, n)}\"")
        sendEvent("onDados", mapOf("alca" to alca, "b64" to Base64.encodeToString(buffer, 0, n, Base64.NO_WRAP)))
        continue
      }
      // -1 vem tanto do prazo quanto do aparelho que sumiu: só a lista diz qual foi.
      if (c.aberta.get() && usb.deviceList[c.dispositivo.deviceName] == null) {
        fechar(alca, "sumiu")
        return
      }
    }
  }

  private fun fechar(alca: Int, motivo: String?) {
    val c = conexoes.remove(alca) ?: return
    Log.i(TAG, "fechar: alca=$alca motivo=${motivo ?: "pedido do app"}")
    if (!c.aberta.compareAndSet(true, false)) return
    for (itf in c.interfaces) {
      try { c.conexao.releaseInterface(itf) } catch (_: Exception) {}
    }
    try { c.conexao.close() } catch (_: Exception) {}
    if (motivo != null) sendEvent("onFim", mapOf("alca" to alca, "motivo" to motivo))
  }

  /** Os primeiros bytes como texto, para o registro: o que não é letra vira \\xNN. */
  private fun visivel(b: ByteArray, n: Int): String {
    val s = StringBuilder()
    for (i in 0 until minOf(n, 96)) {
      val v = b[i].toInt() and 0xff
      when {
        v == 10 -> s.append("\\n")
        v == 13 -> s.append("\\r")
        v in 32..126 -> s.append(v.toChar())
        else -> s.append("\\x").append(String.format("%02X", v))
      }
    }
    if (n > 96) s.append("...")
    return s.toString()
  }

  companion object {
    private const val TAG = "BeeUsbSerial"
    private const val VID_ESPRESSIF = 0x303A
  }
}
