// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react-swc";
// import path from "path";
// import { componentTagger } from "lovable-tagger";

// // https://vitejs.dev/config/
// export default defineConfig(({ mode }) => ({
//   server: {
//     host: "::",
//     port: 8080,
//   },
//   plugins: [
//     react(),
//     mode === 'development' &&
//     componentTagger(),
//   ].filter(Boolean),
//   resolve: {
//     alias: {
//       "@": path.resolve(__dirname, "./src"),
//     },
//   },
// }));
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
	// baca env (opsional): VITE_API_PROXY_TARGET=http://localhost:8000
	const env = loadEnv(mode, process.cwd(), "");
	const proxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8000";

	return {
		server: {
			host: "::",
			port: 8080,
			proxy: {
				"/api": {
					target: proxyTarget,
					changeOrigin: true,
					secure: false, // backend http / self-signed ok
					rewrite: (p) => p.replace(/^\/api/, ""), // hapus prefix /api saat diteruskan
				},
			},
		},
		preview: {
			// Add this for production
			host: "0.0.0.0",
			port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
			allowedHosts: ["matea-app-production-ce5a.up.railway.app"],
		},
		plugins: [react(), mode === "development" && componentTagger()].filter(
			Boolean
		),
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
	};
});
