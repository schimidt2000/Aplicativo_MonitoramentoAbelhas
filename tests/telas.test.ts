/**
 * Nenhum texto visível escrito à mão em componente (Princípio V; portão 2 do
 * PR): toda string de src/app e src/ui vem de src/core/i18n. A verificação é
 * estática, sobre os .tsx — ver tests/apoio/textoLiteral.ts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textosLiterais } from './apoio/textoLiteral';

const RAIZ = join(__dirname, '..');

function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTsx(caminho);
    return caminho.endsWith('.tsx') ? [caminho] : [];
  });
}

describe('texto literal em componente', () => {
  const arquivos = ['src/app', 'src/ui'].flatMap((d) => arquivosTsx(join(RAIZ, d)));

  it('varre as telas e os componentes (e não uma lista vazia)', () => {
    const nomes = arquivos.map((a) => relative(RAIZ, a));
    expect(nomes).toEqual(expect.arrayContaining([
      'src/app/(tabs)/coletar.tsx', 'src/app/(tabs)/enviar.tsx', 'src/app/(tabs)/ajustes.tsx',
      'src/app/(tabs)/index.tsx', 'src/app/(tabs)/_layout.tsx', 'src/app/diagnostico.tsx',
      'src/app/colmeia/[id].tsx', 'src/ui/Grafico.tsx',
    ]));
  });

  it('nenhum .tsx de src/app ou src/ui tem texto visível fora do i18n', () => {
    const achados = arquivos.flatMap((a) =>
      textosLiterais(relative(RAIZ, a), readFileSync(a, 'utf8')));
    expect(achados).toEqual([]);
  });
});

describe('a própria verificação (se ela não reprova nada, não serve)', () => {
  const achar = (fonte: string) => textosLiterais('exemplo.tsx', fonte).map((a) => a.texto);

  it('reprova texto JSX, atributo visível, frase em expressão e template', () => {
    expect(achar('const a = <Text>Colmeias</Text>;')).toEqual(['Colmeias']);
    expect(achar('const a = <TextInput placeholder="XXXX-XXXX" />;'))
      .toEqual(['placeholder="XXXX-XXXX"']);
    expect(achar('const a = <Text>{ok ? \'Sol ligado\' : \'Modo sol\'}</Text>;'))
      .toEqual(['Sol ligado', 'Modo sol']);
    expect(achar('const c = { titulo: \'Temperatura\' };')).toEqual(['Temperatura']);
    expect(achar('const a = <Text>{`${n} dias com dado`}</Text>;')).toHaveLength(1);
    expect(achar('const a = <Pressable accessibilityLabel="Alternar modo sol" />;'))
      .toHaveLength(1);
  });

  it('reprova palavra solta em minúsculas quando ela vai direto para a tela', () => {
    expect(achar('const a = <Text>{ok ? \'pronto\' : \'pendente\'}</Text>;'))
      .toEqual(['pronto', 'pendente']);
    expect(achar('const a = <Text>{n + \' dias\'}</Text>;')).toEqual(['dias']);
    expect(achar('const a = <Text>{n} {\'dias\'}</Text>;')).toEqual(['dias']);
    expect(achar('const a = <Text>{`dias`}</Text>;')).toEqual(['dias']);
    expect(achar('const a = <Btn label={sol ? \'ligado\' : \'ligar\'} />;'))
      .toEqual(['ligado', 'ligar']);
  });

  it('reprova frase montada fora do JSX e propriedade que chega à tela', () => {
    // Montada numa variável e só depois desenhada: o template já é a frase.
    expect(achar('const r = `${n} dias`; const a = <Text>{r}</Text>;')).toEqual(['… dias']);
    expect(achar('const r = `${a} de ${b}`;')).toHaveLength(1);
    // Título de rota e valor lido pelo leitor de tela, mesmo uma palavra só.
    expect(achar('const a = <Tabs.Screen options={{ title: \'colmeias\' }} />;'))
      .toEqual(['colmeias']);
    expect(achar('const a = <V accessibilityValue={{ now: 1, text: `${a} de ${b}` }} />;'))
      .toHaveLength(1);
  });

  it('não confunde path SVG, chave de lista e largura em template com texto', () => {
    expect(achar(`
      const a = <Path key={\`f\${i}\`} d={\`M\${ida} L\${volta} Z\`} />;
      const b = { width: \`\${p}%\`, chave: \`\${base}.\${n === 1 ? 'um' : 'outros'}\` };
      const c = <Stack.Screen options={{ title: t('a.b'), headerShown: false }} />;
    `)).toEqual([]);
  });

  it('não confunde comparação, argumento e estilo dentro de JSX com texto', () => {
    expect(achar(`
      const a = <View>{estado.fase === 'resultado' && <Text style={s.x}>{t('a.b')}</Text>}</View>;
      const b = <Text>{fmtData(x, 'curta')}{mapa['chave']}{n}{'%'}</Text>;
      const c = <View style={{ alignSelf: ok ? 'center' : 'stretch' }} />;
      const d = <Text>{tipo === 'sol' ? t('a.b') : t('a.c')}</Text>;
    `)).toEqual([]);
  });

  it('deixa passar chave de i18n, estilo, identificador e unidade', () => {
    expect(achar(`
      const s = StyleSheet.create({ a: { alignItems: 'center', fontWeight: '700' } });
      const a = <Text style={s.a} accessibilityRole="header">{t('coleta.botao.coletar')}</Text>;
      const b = <Text>{tp('colmeias.total', n, { nome: x })}</Text>;
      const c = estado.fase === 'sem-colmeias' ? t(sol ? 'a.b' : 'a.c') : null;
      const d = { sufixo: ' °C', href: '/colmeia/[id]', largura: \`\${p}%\` };
      const e = useState<Estado>({ fase: 'ocioso' }); const f = a < b && c > d;
      // Comentário com Frase Inteira não é texto de tela.
    `)).toEqual([]);
  });
});
