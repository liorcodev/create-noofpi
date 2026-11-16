export default defineRouteMiddleware((to) => {
  if (import.meta.env.DEV) console.log("->", to.path);
});
