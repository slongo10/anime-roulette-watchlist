import { useFetch, useCountdown, useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

const WATCHLIST_KEY = 'anime-roulette-watchlist'
const URL = 'https://api.tenrai.org/v1/random/anime'
const MAX_SAFE_SPIN_ATTEMPTS = 5
const RETRY_SECONDS = 10

const isAllowedRating = (rating) => {
  if (!rating) return false

  return !rating.trim().startsWith('R')
}

export function useAnimeRoulette() {
  const anime = ref(null)
  const loading = ref(false)
  const error = ref('')
  const { remaining: cooldownLeft, start: startCooldown } = useCountdown(0, {
    interval: 1000,
  })
  const watchlist = useLocalStorage(WATCHLIST_KEY, [])

  const spin = async () => {
    if (loading.value || cooldownLeft.value > 0) return

    loading.value = true
    error.value = ''

    try {
      for (let attempt = 0; attempt < MAX_SAFE_SPIN_ATTEMPTS; attempt++) {
        const request = useFetch(URL, { immediate: false }).get().json()
        await request.execute()

        const response = request.response.value

        if (!response) {
          error.value =
            'Network error while contacting Tenrai. Check your internet connection and try again.'
          return
        }

        if (response.status === 429) {
          startCooldown(RETRY_SECONDS)
          error.value = `Rate-limited (429). Please wait ${RETRY_SECONDS}s before spinning again.`
          return
        }

        if (!response.ok) {
          error.value = `Something went wrong while contacting Tenrai. Status: ${response.status}.`
          return
        }
        if (request.error.value) {
          error.value = `Network error while contacting Tenrai. Check your internet connection and try again.`
          return
        }

        const candidateAnime = request.data.value?.data || null

        if (!candidateAnime) {
          error.value = 'Tenrai returned an empty anime payload. Try spinning again'
          return
        }

        if (!isAllowedRating(candidateAnime.rating)) {
          continue
        }
        anime.value = candidateAnime

        return
      }
    } catch {
      error.value = 'could not find an anime right now. Please spin again in a moment.'
    } finally {
      loading.value = false
    }
  }

  const addToWatchList = (animeToAdd) => {
    if (!animeToAdd?.mal_id) {
      return
    }

    const alreadyInWatchList = watchlist.value.some(
      (watchlistAnime) => watchlistAnime.mal_id === animeToAdd.mal_id,
    )
    if (alreadyInWatchList) {
      return
    }
    watchlist.value.unshift({
      mal_id: animeToAdd.mal_id,
      title: animeToAdd.title,
      score: animeToAdd.score,
      episodes: animeToAdd.episodes,
      rating: animeToAdd.rating,
      url: animeToAdd.url,
      image:
        animeToAdd.images?.jpeg?.large_image_url ||
        animeToAdd.images?.jpeg?.image_url ||
        animeToAdd.images?.webp?.large_image_url ||
        animeToAdd.images?.webp?.image_url ||
        '',
    })
  }

  return {
    anime,
    loading,
    error,
    spin,
    cooldownLeft,
    watchlist,
    addToWatchList,
  }
}
