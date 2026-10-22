/**
 * Entrega um arquivo de texto à pessoa, no navegador (Blob + <a download>).
 * Só existe na web; no aparelho devolve false e a tela nem oferece o botão
 * (a tela de cabo só funciona no navegador do computador).
 *
 * O texto já vem pronto, com BOM se for planilha: o Blob grava em UTF-8.
 */
export function baixarTexto(nome: string, conteudo: string, tipoMime = 'text/csv;charset=utf-8'): boolean {
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
      return false;
    }
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipoMime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Dá tempo de o navegador começar a gravar antes de soltar a memória.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
