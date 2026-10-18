# Mộc Chi Web Finance

Ứng dụng quản lý tài chính cá nhân dùng Next.js App Router, giao diện mobile-first và Firebase.

## Chạy cục bộ

```bash
npm install
cp .env.example .env.local
npm run dev
```

Tạo Firebase project, bật Firebase Authentication và Cloud Firestore, sau đó điền các biến `NEXT_PUBLIC_FIREBASE_*` vào `.env.local`. Giao diện hiện sử dụng dữ liệu demo; lớp Firebase đã sẵn sàng tại `src/lib/firebase.ts`.

## Firebase cần bật

- Trong Authentication, bật nhà cung cấp Google.
- Trong Cloud Firestore, tạo database ở Production mode và publish nội dung của `firestore.rules`.
- Sau khi đăng nhập, giao dịch được lưu dưới đường dẫn `users/{uid}/transactions`.
