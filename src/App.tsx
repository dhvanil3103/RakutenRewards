import { Route, Routes } from "react-router-dom";
import { CartProvider } from "./app/CartContext";
import { ExtensionProvider } from "./app/ExtensionContext";
import { DemoBanner } from "./components/DemoBanner";
import { StoreLayout } from "./components/StoreLayout";
import CartPage from "./pages/CartPage";
import Home from "./pages/Home";
import Listing from "./pages/Listing";
import ProductPage from "./pages/ProductPage";

export default function App() {
  return (
    <ExtensionProvider>
      <CartProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/:storeId" element={<StoreLayout />}>
            <Route index element={<Listing />} />
            <Route path="p/:productId" element={<ProductPage />} />
            <Route path="cart" element={<CartPage />} />
          </Route>
        </Routes>
        <DemoBanner />
      </CartProvider>
    </ExtensionProvider>
  );
}
