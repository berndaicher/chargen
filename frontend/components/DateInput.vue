<script setup lang="ts">
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const dateRef = ref<HTMLInputElement | null>(null);
const error = ref('');

function validateDE(val: string): string {
  if (!val) return '';
  const m = val.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return 'Format: dd.mm.yyyy';
  const day = parseInt(m[1]), month = parseInt(m[2]), year = parseInt(m[3]);
  if (month < 1 || month > 12) return 'Ungültiger Monat';
  if (day < 1 || day > 31) return 'Ungültiger Tag';
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day)
    return 'Ungültiges Datum';
  return '';
}

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  error.value = validateDE(val);
  emit('update:modelValue', val);
}

function deToISO(de: string): string {
  const m = de.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function isoToDE(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function openPicker() {
  if (!dateRef.value) return;
  dateRef.value.value = deToISO(props.modelValue);
  dateRef.value.showPicker();
}

function onPickerChange(e: Event) {
  const iso = (e.target as HTMLInputElement).value;
  if (iso) {
    const de = isoToDE(iso);
    error.value = '';
    emit('update:modelValue', de);
  }
}
</script>

<template>
  <div class="date-input-wrapper">
    <div class="date-input-row">
      <input
        :value="modelValue"
        @input="onInput"
        type="text"
        placeholder="dd.mm.yyyy"
        maxlength="10"
        class="date-text-input"
      />
      <button type="button" class="date-picker-btn" @click="openPicker" title="Kalender öffnen">📅</button>
      <input ref="dateRef" type="date" class="date-hidden" @change="onPickerChange" tabindex="-1" />
    </div>
    <span v-if="error" class="date-error">{{ error }}</span>
  </div>
</template>

<style scoped>
.date-input-wrapper {
  display: flex;
  flex-direction: column;
}

.date-input-row {
  display: flex;
  align-items: center;
  position: relative;
}

.date-text-input {
  flex: 1;
  min-width: 0;
  padding-right: 36px !important;
}

.date-picker-btn {
  position: absolute;
  right: 2px;
  background: none;
  border: none;
  padding: 4px 6px;
  font-size: 1rem;
  cursor: pointer;
  color: var(--muted);
  min-width: auto;
}

.date-picker-btn:hover {
  background: rgba(254, 206, 21, 0.35);
  border-radius: 4px;
}

.date-hidden {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
  border: none;
  padding: 0;
}

.date-error {
  color: #c0392b;
  font-size: 0.75rem;
  margin-top: 2px;
}
</style>
