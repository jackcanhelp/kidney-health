package com.kidneyhealth.potassiumscanner

import android.Manifest
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.accompanist.permissions.shouldShowRationale
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.kidneyhealth.potassiumscanner.ui.theme.PotassiumScannerTheme
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PotassiumScannerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    PotassiumScannerApp()
                }
            }
        }
    }
}

// Potassium level enum
enum class PotassiumLevel(val label: String, val labelChinese: String, val color: Color) {
    LOW("Low Potassium", "低鉀", Color(0xFF10B981)),      // Green
    MEDIUM("Medium Potassium", "中鉀", Color(0xFFF59E0B)), // Yellow/Orange
    HIGH("High Potassium", "高鉀", Color(0xFFEF4444))      // Red
}

// Data class for food info
data class FoodInfo(
    val nameChinese: String,
    val potassiumMg: Int,  // mg per 100g
    val level: PotassiumLevel
)

// Hardcoded potassium data (English ML Kit label -> Food Info)
// 資料來源：USDA FoodData Central / SR Legacy, 台灣食藥署食品營養成分資料庫 2023版
// 數值為每100g可食部分(生鮮)之鉀含量(mg)，熟食另註明
val potassiumDatabase: Map<String, FoodInfo> = mapOf(
    // ===== 水果 Fruits =====
    // 高鉀 High Potassium (> 300mg/100g)
    "banana" to FoodInfo("香蕉", 358, PotassiumLevel.HIGH),           // USDA: 358
    "avocado" to FoodInfo("酪梨", 485, PotassiumLevel.HIGH),          // USDA: 485
    "kiwi" to FoodInfo("奇異果", 312, PotassiumLevel.HIGH),           // USDA: 312
    "kiwi fruit" to FoodInfo("奇異果", 312, PotassiumLevel.HIGH),     // USDA: 312
    "cantaloupe" to FoodInfo("哈密瓜", 267, PotassiumLevel.MEDIUM),   // USDA: 267
    "melon" to FoodInfo("哈密瓜", 267, PotassiumLevel.MEDIUM),        // USDA: 267
    "dried fruit" to FoodInfo("果乾", 750, PotassiumLevel.HIGH),      // USDA: ~750 (平均)
    "raisin" to FoodInfo("葡萄乾", 749, PotassiumLevel.HIGH),         // USDA: 749
    "date" to FoodInfo("椰棗", 656, PotassiumLevel.HIGH),             // USDA: 656 (deglet noor)
    "jackfruit" to FoodInfo("菠蘿蜜", 448, PotassiumLevel.HIGH),      // USDA: 448
    "durian" to FoodInfo("榴槤", 436, PotassiumLevel.HIGH),           // USDA: 436
    "guava" to FoodInfo("芭樂", 417, PotassiumLevel.HIGH),            // USDA: 417
    "pomegranate" to FoodInfo("石榴", 236, PotassiumLevel.MEDIUM),    // USDA: 236
    "papaya" to FoodInfo("木瓜", 182, PotassiumLevel.MEDIUM),         // USDA: 182

    // 中鉀 Medium Potassium (150-300mg/100g)
    "mango" to FoodInfo("芒果", 168, PotassiumLevel.MEDIUM),          // USDA: 168, 台灣: 172
    "orange" to FoodInfo("柳橙", 181, PotassiumLevel.MEDIUM),         // USDA navel: 181
    "tangerine" to FoodInfo("橘子", 166, PotassiumLevel.MEDIUM),      // USDA mandarin: 166
    "peach" to FoodInfo("水蜜桃", 190, PotassiumLevel.MEDIUM),        // USDA: 190
    "grape" to FoodInfo("葡萄", 191, PotassiumLevel.MEDIUM),          // USDA: 191
    "cherry" to FoodInfo("櫻桃", 222, PotassiumLevel.MEDIUM),         // USDA: 222
    "plum" to FoodInfo("李子", 157, PotassiumLevel.MEDIUM),           // USDA: 157
    "lychee" to FoodInfo("荔枝", 171, PotassiumLevel.MEDIUM),         // USDA: 171
    "longan" to FoodInfo("龍眼", 266, PotassiumLevel.MEDIUM),         // USDA: 266
    "persimmon" to FoodInfo("柿子", 161, PotassiumLevel.MEDIUM),      // USDA Japanese: 161
    "dragon fruit" to FoodInfo("火龍果", 268, PotassiumLevel.MEDIUM), // USDA pitaya: 268
    "pitaya" to FoodInfo("火龍果", 268, PotassiumLevel.MEDIUM),       // USDA: 268
    "strawberry" to FoodInfo("草莓", 153, PotassiumLevel.MEDIUM),     // USDA: 153, 台灣: 180

    // 低鉀 Low Potassium (< 150mg/100g)
    "apple" to FoodInfo("蘋果", 107, PotassiumLevel.LOW),             // USDA: 107, 台灣: 110
    "watermelon" to FoodInfo("西瓜", 112, PotassiumLevel.LOW),        // USDA: 112, 台灣: 118
    "pear" to FoodInfo("梨子", 116, PotassiumLevel.LOW),              // USDA: 116, 台灣: 120
    "pineapple" to FoodInfo("鳳梨", 109, PotassiumLevel.LOW),         // USDA: 109, 台灣: 115
    "grapefruit" to FoodInfo("葡萄柚", 135, PotassiumLevel.LOW),      // USDA: 135
    "blueberry" to FoodInfo("藍莓", 77, PotassiumLevel.LOW),          // USDA: 77
    "cranberry" to FoodInfo("蔓越莓", 85, PotassiumLevel.LOW),        // USDA: 85
    "lemon" to FoodInfo("檸檬", 138, PotassiumLevel.LOW),             // USDA: 138 (含皮)
    "lime" to FoodInfo("萊姆", 102, PotassiumLevel.LOW),              // USDA: 102

    // ===== 蔬菜 Vegetables =====
    // 高鉀 High Potassium (> 300mg/100g)
    "potato" to FoodInfo("馬鈴薯", 425, PotassiumLevel.HIGH),         // USDA raw w/skin: 425
    "sweet potato" to FoodInfo("地瓜", 337, PotassiumLevel.HIGH),     // USDA raw: 337
    "spinach" to FoodInfo("菠菜", 558, PotassiumLevel.HIGH),          // USDA raw: 558
    "mushroom" to FoodInfo("蘑菇", 318, PotassiumLevel.HIGH),         // USDA white raw: 318, 台灣洋菇: 450
    "broccoli" to FoodInfo("花椰菜", 316, PotassiumLevel.HIGH),       // USDA raw: 316
    "brussels sprout" to FoodInfo("球芽甘藍", 389, PotassiumLevel.HIGH), // USDA raw: 389
    "artichoke" to FoodInfo("朝鮮薊", 370, PotassiumLevel.HIGH),      // USDA raw: 370
    "beet" to FoodInfo("甜菜根", 325, PotassiumLevel.HIGH),           // USDA raw: 325
    "carrot" to FoodInfo("胡蘿蔔", 320, PotassiumLevel.HIGH),         // USDA raw: 320
    "pumpkin" to FoodInfo("南瓜", 340, PotassiumLevel.HIGH),          // USDA raw: 340, 台灣: 350
    "squash" to FoodInfo("南瓜", 340, PotassiumLevel.HIGH),           // USDA raw: 340
    "bamboo shoot" to FoodInfo("竹筍", 533, PotassiumLevel.HIGH),     // USDA raw: 533
    "sweet potato leaves" to FoodInfo("番薯葉", 310, PotassiumLevel.HIGH), // 台灣FDA: 310

    // 中鉀 Medium Potassium (150-300mg/100g)
    "tomato" to FoodInfo("番茄", 237, PotassiumLevel.MEDIUM),         // USDA raw: 237
    "corn" to FoodInfo("玉米", 270, PotassiumLevel.MEDIUM),           // USDA sweet corn raw: 270
    "celery" to FoodInfo("芹菜", 260, PotassiumLevel.MEDIUM),         // USDA raw: 260
    "asparagus" to FoodInfo("蘆筍", 202, PotassiumLevel.MEDIUM),      // USDA raw: 202
    "eggplant" to FoodInfo("茄子", 229, PotassiumLevel.MEDIUM),       // USDA raw: 229
    "bell pepper" to FoodInfo("甜椒", 211, PotassiumLevel.MEDIUM),    // USDA red raw: 211
    "pepper" to FoodInfo("甜椒", 211, PotassiumLevel.MEDIUM),         // USDA: 211
    "zucchini" to FoodInfo("櫛瓜", 261, PotassiumLevel.MEDIUM),       // USDA raw: 261
    "bitter melon" to FoodInfo("苦瓜", 296, PotassiumLevel.MEDIUM),   // USDA: 296, 台灣: 270
    "okra" to FoodInfo("秋葵", 299, PotassiumLevel.MEDIUM),           // USDA raw: 299
    "cabbage" to FoodInfo("高麗菜", 170, PotassiumLevel.MEDIUM),      // USDA raw: 170, 台灣: 310(?)
    "lettuce" to FoodInfo("生菜", 194, PotassiumLevel.MEDIUM),        // USDA green leaf: 194
    "green bean" to FoodInfo("四季豆", 211, PotassiumLevel.MEDIUM),   // USDA raw: 211
    "radish" to FoodInfo("白蘿蔔", 233, PotassiumLevel.MEDIUM),      // USDA raw: 233

    // 低鉀 Low Potassium (< 150mg/100g)
    "cucumber" to FoodInfo("小黃瓜", 147, PotassiumLevel.LOW),        // USDA raw: 147
    "onion" to FoodInfo("洋蔥", 146, PotassiumLevel.LOW),             // USDA raw: 146
    "bean sprout" to FoodInfo("豆芽菜", 149, PotassiumLevel.LOW),     // USDA mung sprout: 149

    // ===== 肉類 Proteins - Meat =====
    "beef" to FoodInfo("牛肉", 318, PotassiumLevel.HIGH),             // USDA beef round raw: 318
    "steak" to FoodInfo("牛排", 318, PotassiumLevel.HIGH),            // USDA: 318
    "pork" to FoodInfo("豬肉", 341, PotassiumLevel.HIGH),             // USDA pork loin raw: 341, 台灣梅花: 245
    "pork belly" to FoodInfo("五花肉", 231, PotassiumLevel.MEDIUM),   // 台灣FDA: 231
    "chicken" to FoodInfo("雞肉", 229, PotassiumLevel.MEDIUM),        // USDA breast raw: 256, 台灣雞腿: 265
    "poultry" to FoodInfo("雞肉", 229, PotassiumLevel.MEDIUM),        // USDA: ~229 (平均)
    "chicken breast" to FoodInfo("雞胸肉", 256, PotassiumLevel.MEDIUM), // USDA raw: 256
    "chicken thigh" to FoodInfo("雞腿", 265, PotassiumLevel.MEDIUM),  // 台灣FDA: 265
    "lamb" to FoodInfo("羊肉", 310, PotassiumLevel.HIGH),             // USDA lamb loin raw: 310, 台灣: 327
    "pork liver" to FoodInfo("豬肝", 302, PotassiumLevel.HIGH),       // 台灣FDA: 302

    // ===== 海鮮 Seafood =====
    "fish" to FoodInfo("魚", 356, PotassiumLevel.HIGH),               // USDA 一般魚類: ~356
    "salmon" to FoodInfo("鮭魚", 363, PotassiumLevel.HIGH),           // USDA Atlantic raw: 363
    "tuna" to FoodInfo("鮪魚", 252, PotassiumLevel.MEDIUM),           // USDA canned in water: 252
    "shrimp" to FoodInfo("蝦", 185, PotassiumLevel.MEDIUM),           // USDA raw: 185, 台灣蝦仁: 72
    "crab" to FoodInfo("螃蟹", 329, PotassiumLevel.HIGH),             // USDA blue crab raw: 329
    "seafood" to FoodInfo("海鮮", 280, PotassiumLevel.MEDIUM),        // 一般海鮮平均
    "clam" to FoodInfo("蛤蜊", 314, PotassiumLevel.HIGH),             // USDA: 314, 台灣蛤仔: 237
    "oyster" to FoodInfo("牡蠣", 168, PotassiumLevel.MEDIUM),         // USDA Pacific raw: 168
    "squid" to FoodInfo("魷魚", 246, PotassiumLevel.MEDIUM),          // USDA raw: 246
    "tilapia" to FoodInfo("吳郭魚", 302, PotassiumLevel.HIGH),        // USDA raw: 302, 台灣: 402
    "mackerel" to FoodInfo("鯖魚", 314, PotassiumLevel.HIGH),         // USDA Atlantic raw: 314
    "sardine" to FoodInfo("沙丁魚", 397, PotassiumLevel.HIGH),        // USDA canned: 397
    "scallop" to FoodInfo("干貝", 205, PotassiumLevel.MEDIUM),        // USDA raw: 205

    // ===== 蛋奶 Eggs & Dairy =====
    "egg" to FoodInfo("雞蛋", 138, PotassiumLevel.LOW),               // USDA whole raw: 138, 台灣: 123
    "milk" to FoodInfo("牛奶", 132, PotassiumLevel.LOW),              // USDA whole milk: 132
    "cheese" to FoodInfo("起司", 98, PotassiumLevel.LOW),             // USDA cheddar: 98
    "yogurt" to FoodInfo("優格", 155, PotassiumLevel.MEDIUM),         // USDA plain whole: 155

    // ===== 豆類與堅果 Legumes & Nuts =====
    "bean" to FoodInfo("豆類", 403, PotassiumLevel.HIGH),             // USDA kidney bean cooked: 403
    "lentil" to FoodInfo("扁豆", 369, PotassiumLevel.HIGH),           // USDA cooked: 369
    "soybean" to FoodInfo("黃豆(乾)", 1797, PotassiumLevel.HIGH),     // USDA dry: 1797, 台灣: 1570
    "edamame" to FoodInfo("毛豆", 436, PotassiumLevel.HIGH),          // USDA frozen: 436
    "tofu" to FoodInfo("豆腐", 180, PotassiumLevel.MEDIUM),           // 台灣FDA傳統豆腐: 180
    "soy milk" to FoodInfo("豆漿", 118, PotassiumLevel.LOW),          // USDA unsweetened: 118, 台灣: 47
    "red bean" to FoodInfo("紅豆(乾)", 988, PotassiumLevel.HIGH),     // 台灣FDA: 988
    "mung bean" to FoodInfo("綠豆(乾)", 398, PotassiumLevel.HIGH),    // 台灣FDA: 398
    "peanut" to FoodInfo("花生", 705, PotassiumLevel.HIGH),           // USDA raw: 705, 台灣: 546
    "almond" to FoodInfo("杏仁", 733, PotassiumLevel.HIGH),           // USDA raw: 733
    "walnut" to FoodInfo("核桃", 441, PotassiumLevel.HIGH),           // USDA English: 441
    "cashew" to FoodInfo("腰果", 660, PotassiumLevel.HIGH),           // USDA raw: 660
    "pistachio" to FoodInfo("開心果", 1025, PotassiumLevel.HIGH),     // USDA raw: 1025
    "nut" to FoodInfo("堅果", 600, PotassiumLevel.HIGH),              // 堅果平均: ~600
    "seed" to FoodInfo("種子", 500, PotassiumLevel.HIGH),             // 種子平均: ~500
    "sunflower seed" to FoodInfo("葵花子", 645, PotassiumLevel.HIGH), // USDA dried: 645
    "pumpkin seed" to FoodInfo("南瓜子", 809, PotassiumLevel.HIGH),   // USDA dried: 809, 台灣瓜子: 779
    "sesame" to FoodInfo("芝麻", 468, PotassiumLevel.HIGH),           // USDA whole dried: 468, 台灣黑芝麻: 527

    // ===== 穀類 Grains & Carbs =====
    "rice" to FoodInfo("白飯(熟)", 35, PotassiumLevel.LOW),           // USDA cooked: 35, 台灣: 40
    "brown rice" to FoodInfo("糙米飯(熟)", 79, PotassiumLevel.LOW),   // USDA cooked: 79, 台灣乾: 312
    "bread" to FoodInfo("麵包", 115, PotassiumLevel.LOW),             // USDA white: 115, 台灣白土司: 109
    "pasta" to FoodInfo("義大利麵(熟)", 44, PotassiumLevel.LOW),      // USDA cooked: 44
    "noodle" to FoodInfo("麵條(熟)", 44, PotassiumLevel.LOW),         // USDA cooked: 44, 台灣麵線: 87
    "oatmeal" to FoodInfo("燕麥片(熟)", 61, PotassiumLevel.LOW),      // USDA cooked: 61, 台灣乾: 119
    "cereal" to FoodInfo("穀片", 224, PotassiumLevel.MEDIUM),         // USDA varies: ~224
    "cracker" to FoodInfo("餅乾", 131, PotassiumLevel.LOW),           // USDA saltine: 131
    "cookie" to FoodInfo("餅乾", 131, PotassiumLevel.LOW),            // USDA: ~131

    // ===== 飲料 Beverages =====
    "coffee" to FoodInfo("咖啡", 49, PotassiumLevel.LOW),             // USDA brewed: 49
    "tea" to FoodInfo("茶", 37, PotassiumLevel.LOW),                  // USDA brewed: 37
    "juice" to FoodInfo("果汁", 200, PotassiumLevel.MEDIUM),          // 果汁平均: ~200
    "orange juice" to FoodInfo("柳橙汁", 200, PotassiumLevel.MEDIUM), // USDA: 200
    "coconut water" to FoodInfo("椰子水", 250, PotassiumLevel.MEDIUM), // USDA: 250
    "soda" to FoodInfo("汽水", 2, PotassiumLevel.LOW),                // USDA cola: 2
    "beer" to FoodInfo("啤酒", 27, PotassiumLevel.LOW),               // USDA regular: 27
    "wine" to FoodInfo("葡萄酒", 127, PotassiumLevel.LOW),            // USDA red: 127

    // ===== 點心與其他 Snacks & Others =====
    "chocolate" to FoodInfo("巧克力(黑)", 715, PotassiumLevel.HIGH),  // USDA dark 70-85%: 715
    "candy" to FoodInfo("糖果", 10, PotassiumLevel.LOW),              // USDA hard candy: ~10
    "ice cream" to FoodInfo("冰淇淋", 199, PotassiumLevel.MEDIUM),    // USDA vanilla: 199
    "cake" to FoodInfo("蛋糕", 128, PotassiumLevel.LOW),              // USDA yellow: 128
    "pizza" to FoodInfo("披薩", 184, PotassiumLevel.MEDIUM),          // USDA cheese: 184
    "hamburger" to FoodInfo("漢堡", 227, PotassiumLevel.MEDIUM),      // USDA: ~227
    "sandwich" to FoodInfo("三明治", 180, PotassiumLevel.MEDIUM),     // 一般三明治: ~180
    "french fries" to FoodInfo("薯條", 579, PotassiumLevel.HIGH),     // USDA fried: 579
    "chip" to FoodInfo("洋芋片", 1275, PotassiumLevel.HIGH),          // USDA: 1275
    "popcorn" to FoodInfo("爆米花", 329, PotassiumLevel.HIGH),        // USDA air-popped: 329

    // ===== 通用分類 General Categories =====
    "food" to FoodInfo("食物", 200, PotassiumLevel.MEDIUM),
    "fruit" to FoodInfo("水果", 200, PotassiumLevel.MEDIUM),
    "vegetable" to FoodInfo("蔬菜", 250, PotassiumLevel.MEDIUM),
    "meat" to FoodInfo("肉類", 300, PotassiumLevel.HIGH),
    "produce" to FoodInfo("農產品", 200, PotassiumLevel.MEDIUM),
    "snack" to FoodInfo("點心", 150, PotassiumLevel.MEDIUM),
    "dessert" to FoodInfo("甜點", 150, PotassiumLevel.MEDIUM),
    "baked goods" to FoodInfo("烘焙品", 120, PotassiumLevel.LOW),
    "fast food" to FoodInfo("速食", 250, PotassiumLevel.MEDIUM),
    "salad" to FoodInfo("沙拉", 200, PotassiumLevel.MEDIUM)
)

// Function to lookup food
fun lookupFood(label: String): FoodInfo? {
    val normalizedLabel = label.lowercase().trim()
    return potassiumDatabase[normalizedLabel]
        ?: potassiumDatabase.entries.find { normalizedLabel.contains(it.key) }?.value
        ?: potassiumDatabase.entries.find { it.key.contains(normalizedLabel) }?.value
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun PotassiumScannerApp() {
    val cameraPermissionState = rememberPermissionState(Manifest.permission.CAMERA)

    when {
        cameraPermissionState.status.isGranted -> {
            CameraScreen()
        }
        cameraPermissionState.status.shouldShowRationale -> {
            PermissionRationale(
                onRequestPermission = { cameraPermissionState.launchPermissionRequest() }
            )
        }
        else -> {
            PermissionRequest(
                onRequestPermission = { cameraPermissionState.launchPermissionRequest() }
            )
        }
    }
}

@Composable
fun PermissionRequest(onRequestPermission: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "📸",
            fontSize = 64.sp
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "需要相機權限",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "請允許使用相機來掃描食物並查詢鉀含量",
            textAlign = TextAlign.Center,
            color = Color.Gray
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = onRequestPermission,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF1A4A5E)
            )
        ) {
            Text("允許相機權限")
        }
    }
}

@Composable
fun PermissionRationale(onRequestPermission: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "⚠️",
            fontSize = 64.sp
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "需要相機權限才能使用",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "此應用需要相機權限來辨識食物。請在設定中允許相機權限。",
            textAlign = TextAlign.Center,
            color = Color.Gray
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = onRequestPermission,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF1A4A5E)
            )
        ) {
            Text("重新請求權限")
        }
    }
}

@Composable
fun CameraScreen() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var detectedFood by remember { mutableStateOf<FoodInfo?>(null) }
    var detectedLabel by remember { mutableStateOf("") }
    var isAnalyzing by remember { mutableStateOf(false) }

    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }

    Box(modifier = Modifier.fillMaxSize()) {
        // Camera Preview
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)

                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()

                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }

                    val imageAnalyzer = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also {
                            it.setAnalyzer(cameraExecutor, FoodImageAnalyzer { label, food ->
                                detectedLabel = label
                                detectedFood = food
                            })
                        }

                    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            preview,
                            imageAnalyzer
                        )
                    } catch (e: Exception) {
                        Log.e("CameraScreen", "Use case binding failed", e)
                    }
                }, ContextCompat.getMainExecutor(ctx))

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // Top Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xCC1A4A5E))
                .padding(16.dp)
                .align(Alignment.TopCenter)
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "🥬 食物鉀含量掃描器",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "將相機對準食物進行辨識",
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 14.sp
                )
            }
        }

        // Detection Result Overlay
        AnimatedVisibility(
            visible = detectedFood != null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(16.dp)
                .padding(bottom = 32.dp)
        ) {
            detectedFood?.let { food ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Color.White
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Detected Label
                        Text(
                            text = "偵測到：$detectedLabel",
                            fontSize = 14.sp,
                            color = Color.Gray
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        // Food Name
                        Text(
                            text = food.nameChinese,
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF1A202C)
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        // Potassium Level Badge with traffic light
                        Surface(
                            color = food.level.color.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(50.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                // Traffic light dot
                                Box(
                                    modifier = Modifier
                                        .size(16.dp)
                                        .background(
                                            color = food.level.color,
                                            shape = RoundedCornerShape(50)
                                        )
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "鉀含量：${food.level.labelChinese}",
                                    color = food.level.color,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Potassium Amount
                        Text(
                            text = "每 100g 含鉀 ${food.potassiumMg} mg",
                            fontSize = 16.sp,
                            color = Color.Gray
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        // Advice with traffic light dot
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .background(
                                        color = food.level.color,
                                        shape = RoundedCornerShape(50)
                                    )
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = when (food.level) {
                                    PotassiumLevel.HIGH -> "腎友請適量食用"
                                    PotassiumLevel.MEDIUM -> "腎友可適量食用"
                                    PotassiumLevel.LOW -> "腎友可安心食用"
                                },
                                fontSize = 14.sp,
                                color = food.level.color,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }
        }

        // Legend
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 8.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                LegendItem("低鉀 <150", Color(0xFF10B981))
                LegendItem("中鉀 150-300", Color(0xFFF59E0B))
                LegendItem("高鉀 >300", Color(0xFFEF4444))
            }
        }
    }
}

@Composable
fun LegendItem(text: String, color: Color) {
    Surface(
        color = Color.Black.copy(alpha = 0.5f),
        shape = RoundedCornerShape(20.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .background(
                        color = color,
                        shape = RoundedCornerShape(50)
                    )
            )
            Spacer(modifier = Modifier.width(5.dp))
            Text(
                text = text,
                color = Color.White,
                fontSize = 10.sp
            )
        }
    }
}

// Image Analyzer for ML Kit
class FoodImageAnalyzer(
    private val onFoodDetected: (String, FoodInfo?) -> Unit
) : ImageAnalysis.Analyzer {

    private val labeler = ImageLabeling.getClient(
        ImageLabelerOptions.Builder()
            .setConfidenceThreshold(0.7f)
            .build()
    )

    private var lastAnalyzedTimestamp = 0L

    @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
    override fun analyze(imageProxy: ImageProxy) {
        val currentTimestamp = System.currentTimeMillis()

        // Throttle analysis to every 500ms
        if (currentTimestamp - lastAnalyzedTimestamp < 500) {
            imageProxy.close()
            return
        }
        lastAnalyzedTimestamp = currentTimestamp

        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)

            labeler.process(image)
                .addOnSuccessListener { labels ->
                    // Find the first food-related label
                    for (label in labels) {
                        val food = lookupFood(label.text)
                        if (food != null) {
                            onFoodDetected(label.text, food)
                            break
                        }
                    }

                    // If no food found, show the top label
                    if (labels.isNotEmpty()) {
                        val topLabel = labels[0]
                        val food = lookupFood(topLabel.text)
                        onFoodDetected(topLabel.text, food)
                    }
                }
                .addOnFailureListener { e ->
                    Log.e("FoodImageAnalyzer", "Labeling failed", e)
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }
}
