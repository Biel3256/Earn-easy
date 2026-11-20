import gameCardsImg from '../assets/images/game_cards_icon_1795186544220.jpg';
import gameDotLinkImg from '../assets/images/game_dotlink_icon_1795186545139.jpg';
import gameMathImg from '../assets/images/game_math_icon_1795186543447.jpg';
import gameMemoryImg from '../assets/images/game_memory_icon_1795186544976.jpg';
import gameReflexImg from '../assets/images/game_reflex_icon_1795186544995.jpg';
import gameTicTacToeImg from '../assets/images/game_tictactoe_icon_1795186544275.jpg';
import gameWordSearchImg from '../assets/images/game_wordsearch_icon_1795186544984.jpg';
import heroGamingBannerImg from '../assets/images/hero_gaming_banner_1795186544377.jpg';
import { GameCategory } from '../types/earneasy';

export { heroGamingBannerImg };

export const GAME_THUMBNAILS: Record<GameCategory, string> = {
  tic_tac_toe: gameTicTacToeImg,
  word_search: gameWordSearchImg,
  dot_link: gameDotLinkImg,
  math_sprint: gameMathImg,
  memory_match: gameMemoryImg,
  quick_reflex: gameReflexImg,
  high_low_cards: gameCardsImg,
};
