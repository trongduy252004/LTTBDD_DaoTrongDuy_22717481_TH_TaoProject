import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  FlatList,
  Alert,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy'; 

const EDITED_FOLDER = FileSystem.documentDirectory + 'edited_images/';

type EditedItem = {
  uri: string;
  filename: string;
};

export default function App(): React.JSX.Element {
  const [originalUri, setOriginalUri] = useState<string | null>(null);
  const [editedUri, setEditedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editedList, setEditedList] = useState<EditedItem[]>([]);

  useEffect(() => {
    (async () => {
      await ensureEditedFolder();
      await refreshEditedList();
    })();
  }, []);

  async function ensureEditedFolder() {
    const info = await FileSystem.getInfoAsync(EDITED_FOLDER);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(EDITED_FOLDER, { intermediates: true });
    }
  }

  async function refreshEditedList() {
    try {
      const files = await FileSystem.readDirectoryAsync(EDITED_FOLDER);
      const items: EditedItem[] = files.map((f) => ({
        uri: EDITED_FOLDER + f,
        filename: f,
      }));
      items.sort((a, b) => (a.filename < b.filename ? 1 : -1));
      setEditedList(items);
    } catch (e) {
      console.warn('could not list edited images', e);
    }
  }

  async function pickImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'We need access to your photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });

      // ✅ result.because of Expo SDK 54: "canceled" (US spelling)
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setOriginalUri(result.assets[0].uri);
        setEditedUri(null);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not pick image');
    }
  }

  async function applyRotate90() {
    if (!originalUri && !editedUri) return;
    setLoading(true);
    try {
      const uri = editedUri ?? originalUri!;
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ rotate: 90 }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      setEditedUri(manipResult.uri);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Rotate failed');
    } finally {
      setLoading(false);
    }
  }

  async function applyFlipHorizontal() {
    if (!originalUri && !editedUri) return;
    setLoading(true);
    try {
      const uri = editedUri ?? originalUri!;
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ flip: ImageManipulator.FlipType.Horizontal }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      setEditedUri(manipResult.uri);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Flip failed');
    } finally {
      setLoading(false);
    }
  }

  async function applyCropSquare() {
    if (!originalUri && !editedUri) return;
    setLoading(true);
    try {
      const uri = editedUri ?? originalUri!;
      const resized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      const { width = 1024, height = 1024 } = resized as any;
      const size = Math.min(width, height);
      const originX = Math.max(0, Math.floor((width - size) / 2));
      const originY = Math.max(0, Math.floor((height - size) / 2));
      const cropped = await ImageManipulator.manipulateAsync(
        resized.uri,
        [{ crop: { originX, originY, width: size, height: size } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      setEditedUri(cropped.uri);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Crop failed');
    } finally {
      setLoading(false);
    }
  }

  async function saveEdited() {
    if (!editedUri && !originalUri) return;
    setLoading(true);
    try {
      const uri = editedUri ?? originalUri!;
      const name = `edited_${Date.now()}.jpg`;
      const dest = EDITED_FOLDER + name;
      await FileSystem.copyAsync({ from: uri, to: dest });
      await refreshEditedList();
      Alert.alert('Saved', 'Edited image saved to list');
      setEditedUri(dest);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  async function deleteEdited(item: EditedItem) {
    Alert.alert('Delete', `Delete ${item.filename}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await FileSystem.deleteAsync(item.uri, { idempotent: true });
            await refreshEditedList();
          } catch (e) {
            console.warn('delete failed', e);
          }
        },
      },
    ]);
  }

  function renderEditedItem({ item }: { item: EditedItem }) {
    return (
      <View style={styles.thumbContainer}>
        <TouchableOpacity
          onPress={() => {
            setEditedUri(item.uri);
            setOriginalUri(null);
          }}
        >
          <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.delBtn} onPress={() => deleteEdited(item)}>
          <Text style={styles.delText}>X</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>App chỉnh sửa hình ảnh</Text>

      <View style={styles.topRow}>
        <TouchableOpacity style={styles.button} onPress={pickImage}>
          <Text style={styles.buttonText}>Chọn ảnh</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#4CAF50' }]}
          onPress={saveEdited}
          disabled={!editedUri && !originalUri}
        >
          <Text style={styles.buttonText}>Lưu</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.viewer}>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : editedUri || originalUri ? (
          <Image
            source={{ uri: editedUri ?? originalUri! }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={{ color: '#777' }}>No image selected</Text>
          </View>
        )}
      </View>

      <View style={styles.toolsRow}>
        <TouchableOpacity style={styles.tool} onPress={applyRotate90}>
          <Text style={styles.toolText}>Xoay ảnh</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tool} onPress={applyFlipHorizontal}>
          <Text style={styles.toolText}>Lật ảnh</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tool} onPress={applyCropSquare}>
          <Text style={styles.toolText}>Cắt ảnh vuông</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listContainer}>
        <Text style={styles.subheader}>Hình ảnh đã chỉnh sửa</Text>
        {editedList.length === 0 ? (
          <Text style={{ color: '#777' }}>Chưa có hình ảnh nào được chỉnh sửa</Text>
        ) : (
          <FlatList
            data={editedList}
            keyExtractor={(i) => i.filename}
            renderItem={renderEditedItem}
            horizontal
            showsHorizontalScrollIndicator={false}
          />
        )}
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

const { width } = Dimensions.get('window');
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 40 : 60,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  header: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  subheader: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  button: { backgroundColor: '#2196F3', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  viewer: { height: Math.round(width * 0.7), borderWidth: 1, borderColor: '#eee', borderRadius: 8, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  placeholder: { justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' },
  toolsRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 12 },
  tool: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#eee', borderRadius: 6 },
  toolText: { fontWeight: '600' },
  listContainer: { marginTop: 8 },
  thumb: { width: 100, height: 100, borderRadius: 6, marginRight: 8 },
  thumbContainer: { position: 'relative', marginRight: 8 },
  delBtn: { position: 'absolute', right: 4, top: 4, backgroundColor: 'rgba(0,0,0,0.6)', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  delText: { color: '#fff', fontWeight: '700' },
});
