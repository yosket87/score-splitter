# Googleログインボタンの素材

- デザイン・ロゴ: https://developers.google.com/identity/branding-guidelines
- `google-g.png`: https://developers.google.com/static/identity/images/g-logo.png
- `google-sans-medium.ttf`: Google FontsのGoogle Sans、500。https://fonts.google.com/specimen/Google+Sans
- フォントのライセンス: `google-sans-OFL.txt`（https://github.com/googlefonts/googlesans/blob/main/OFL.txt）

ライトテーマの白背景、枠線、カラーのGを使用する。素材はNext.jsの静的配信へ含め、未認証のログイン画面でも読み込めるようにする。Firebaseの認証処理は呼び出し元に保持する。
