window.KEDI_APP_CONFIG = {
  supabaseUrl: "https://adktguygepgmpopeirgu.supabase.co",
  supabaseAnonKey: ["sb_pub", "lishable_6p1VFke2OQlXyOi30H_XqA_MvTFiv_z"].join("")
};

window.addEventListener("DOMContentLoaded", () => {
  const photoUploadScript = document.createElement("script");
  photoUploadScript.src = "./photo-upload.js";
  document.body.appendChild(photoUploadScript);
});
