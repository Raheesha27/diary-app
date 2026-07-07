import { File } from "expo-file-system";
import { getDB } from "./localdb";
import { supabase } from "./supabase";

async function uploadFile(
  uri: string,
  bucket: string,
  fileExt: string,
  userId: string,
) {
  const file = new File(uri);
  const bytes = await file.bytes();
  const fileName = `${Date.now()}.${fileExt}`;
  const path = `${userId}/${fileName}`;

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: fileExt === "jpg" ? "image/jpeg" : "audio/m4a",
  });
  if (error) throw error;

  const { data, error: urlError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (urlError) throw urlError;
  return data.signedUrl;
}

export async function syncPendingEntries() {
  const database = await getDB();
  const pendingRows = await database.getAllAsync(
    "SELECT * FROM local_entries WHERE sync_status = 'pending';",
  );

  for (const row of pendingRows as any[]) {
    try {
      let imageUrl: string | null = row.image_remote_url;
      let audioUrl: string | null = row.audio_remote_url;

      if (row.image_local_uri && !imageUrl) {
        imageUrl = await uploadFile(
          row.image_local_uri,
          "entry-images",
          "jpg",
          row.user_id,
        );
      }
      if (row.audio_local_uri && !audioUrl) {
        audioUrl = await uploadFile(
          row.audio_local_uri,
          "entry-audio",
          "m4a",
          row.user_id,
        );
      }

      const { error: upsertError } = await supabase.from("entries").upsert({
        id: row.id,
        user_id: row.user_id,
        entry_date: row.entry_date,
        caption: row.caption,
        image_url: imageUrl,
        audio_url: audioUrl,
        updated_at: new Date().toISOString(),
      });

      if (upsertError) throw upsertError;

      await database.runAsync(
        `UPDATE local_entries SET sync_status = 'synced', image_remote_url = $imageUrl, audio_remote_url = $audioUrl WHERE id = $id;`,
        { $imageUrl: imageUrl, $audioUrl: audioUrl, $id: row.id },
      );

      console.log(`Synced pending entry ${row.id} for ${row.entry_date}`);
    } catch (err) {
      console.log(`Failed to sync entry ${row.id} (still offline?):`, err);
      // Leave as pending — will retry next time this runs
    }
  }
}
