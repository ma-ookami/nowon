// Firebase の設定。手順書(README.md)の「4. 設定をコピーする」で表示される
// firebaseConfig の中身を、下の {} の中にそのまま貼り付けてください。
// この値は公開しても問題ありません(データは firestore.rules で守ります)。
window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyDJJohuq2uhspxLkkjc5mBDDv31Yx7VeQE",
    authDomain: "nowon-ea8d9.firebaseapp.com",
    projectId: "nowon-ea8d9",
    storageBucket: "nowon-ea8d9.firebasestorage.app",
    messagingSenderId: "237814020766",
    appId: "1:237814020766:web:13effb0cbb72f1778dd98f"
};

// App Check(本物のアプリ以外からのアクセスを防ぐ)の reCAPTCHA Enterprise のキー(サイトキー)。
// README.md の「App Check を設定する」で、Google Cloud コンソールで作ったキーを "" の中に貼り付けてください。
// 空のままなら App Check は使いません。
window.APPCHECK_SITE_KEY = "";
