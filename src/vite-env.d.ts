/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_AUTH_MODE?: 'local' | 'miami'
	readonly VITE_EDITOR_EMAILS?: string
	readonly VITE_LOCAL_EDITOR_USERNAME?: string
	readonly VITE_LOCAL_EDITOR_PASSWORD?: string
	readonly VITE_OAUTH_SIGN_IN_PATH?: string
	readonly VITE_OAUTH_SIGN_OUT_PATH?: string
	readonly VITE_OAUTH_USERINFO_PATH?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
