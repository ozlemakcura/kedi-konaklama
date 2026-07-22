window.KEDI_APP_CONFIG = {
  supabaseUrl: "https://adktguygepgmpopeirgu.supabase.co",
  supabaseAnonKey: ["sb_pub", "lishable_6p1VFke2OQlXyOi30H_XqA_MvTFiv_z"].join("")
};

window.addEventListener("DOMContentLoaded", () => {
  const photoUploadScript = document.createElement("script");
  photoUploadScript.src = "./photo-upload.js";
  document.body.appendChild(photoUploadScript);

  const buttonFixScript = document.createElement("script");
  buttonFixScript.src = "./button-fix.js";
  document.body.appendChild(buttonFixScript);

  const routineCategoryScript = document.createElement("script");
  routineCategoryScript.src = "./routine-category-custom.js";
  document.body.appendChild(routineCategoryScript);

  const ownerNoteTimeScript = document.createElement("script");
  ownerNoteTimeScript.src = "./owner-note-time.js";
  document.body.appendChild(ownerNoteTimeScript);

  const careNoteEditScript = document.createElement("script");
  careNoteEditScript.src = "./care-note-edit.js";
  document.body.appendChild(careNoteEditScript);

  const careAllCatsScript = document.createElement("script");
  careAllCatsScript.src = "./care-all-cats.js";
  document.body.appendChild(careAllCatsScript);

  const ownerInteractionsScript = document.createElement("script");
  ownerInteractionsScript.src = "./owner-interactions.js";
  document.body.appendChild(ownerInteractionsScript);

  const ownerEmailHookScript = document.createElement("script");
  ownerEmailHookScript.src = "./owner-email-hook.js";
  document.body.appendChild(ownerEmailHookScript);

  const ownerNotificationsScript = document.createElement("script");
  ownerNotificationsScript.src = "./owner-notifications.js";
  document.body.appendChild(ownerNotificationsScript);
});
