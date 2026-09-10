import { lazy } from "react";

const LoginScreen = lazy(() => import("./LoginScreen"));
const RoleSelectScreen = lazy(() => import("./RoleSelectScreen"));

export { LoginScreen, RoleSelectScreen };
