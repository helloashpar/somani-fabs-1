import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sf_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired or revoked login makes every call fail with 401. Send staff back
// to the login screen instead of leaving buttons that silently do nothing.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const isLogin = (err?.config?.url || "").includes("/auth/login");
    if (status === 401 && !isLogin && localStorage.getItem("sf_token")) {
      localStorage.removeItem("sf_token");
      window.location.assign("/admin");
    }
    return Promise.reject(err);
  },
);

export function setToken(t) { localStorage.setItem("sf_token", t); }
export function clearToken() { localStorage.removeItem("sf_token"); }
export function getToken() { return localStorage.getItem("sf_token"); }

export function apiErr(e) {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(", ");
  return e?.message || "Something went wrong";
}
