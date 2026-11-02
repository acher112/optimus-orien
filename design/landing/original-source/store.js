import { ref } from 'vue';

export const isContactModalOpen = ref(false);

export const openContactModal = () => {
    isContactModalOpen.value = true;
};

export const closeContactModal = () => {
    isContactModalOpen.value = false;
};
