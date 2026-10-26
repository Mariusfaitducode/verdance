// Verdance — application mobile. Le jeu lui-même est l'app web servie par le serveur public (Cloudflare) :
// cet écran l'affiche en plein écran et lui donne ce que le navigateur n'a pas (partage natif, bouton retour).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const GAME_URL = 'https://verdance.mariuscode.workers.dev/';
const INK = '#16273a';

// Injecté avant le chargement de la page : le partage passe par la feuille de partage du téléphone.
const BRIDGE = `
  window.VERDANCE_NATIVE = true;
  navigator.share = function (d) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'share', d: d || {} }));
    return Promise.resolve();
  };
  true;
`;

function Game() {
  const web = useRef(null);
  const canGoBack = useRef(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && web.current) { web.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  const onMessage = useCallback(ev => {
    let m; try { m = JSON.parse(ev.nativeEvent.data); } catch (e) { return; }
    if (m.t === 'share') {
      const { text = '', url = '' } = m.d;
      Share.share({ message: [text, url].filter(Boolean).join('\n') }).catch(() => {});
    }
  }, []);

  const retry = () => { setFailed(false); setLoading(true); setKey(k => k + 1); };

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Verdance ne répond pas</Text>
        <Text style={styles.body}>Vérifie ta connexion internet, puis réessaie.</Text>
        <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnDown]} onPress={retry}>
          <Text style={styles.btnText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <WebView
        key={key}
        ref={web}
        source={{ uri: GAME_URL }}
        style={styles.web}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={BRIDGE}
        onMessage={onMessage}
        onNavigationStateChange={s => { canGoBack.current = s.canGoBack; }}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        onHttpError={e => { if (e.nativeEvent.statusCode >= 500) setFailed(true); }}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        textZoom={100}
      />
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={styles.logo}>Verdance</Text>
          <ActivityIndicator color="#ffc83a" size="large" />
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <Game />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: INK },
  fill: { flex: 1, backgroundColor: '#1f6fa6' },
  web: { flex: 1, backgroundColor: '#1f6fa6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#1f6fa6' },
  logo: { color: '#fff', fontSize: 52, fontWeight: '900', marginBottom: 24 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  body: { color: '#d6e2ee', fontSize: 16, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  btn: { backgroundColor: '#5fb83a', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#3f8a22' },
  btnDown: { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
  btnText: { color: '#fff', fontSize: 19, fontWeight: '800' },
});
