<template>
  <Navbar />
  <RouterView />
  <Footer />
  <JellyfishWidget />
</template>

<script setup>
import Navbar from './components/Navbar.vue'
import Footer from './components/Footer.vue'
import JellyfishWidget from './components/JellyfishWidget.vue'
</script>
