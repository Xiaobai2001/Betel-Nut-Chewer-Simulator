package com.chewsimulator.app;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Insets;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.view.WindowInsetsController;

public class MainActivity extends Activity {
    private WebView web;
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(247, 248, 244));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        // This bridge only changes this Activity's display mode; it exposes no device data.
        web.addJavascriptInterface(new DisplayBridge(), "NativeDisplay");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith("file:///android_asset/app/");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith("file:///android_asset/app/");
            }
        });
        setContentView(web);
        if (Build.VERSION.SDK_INT >= 30) {
            web.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                    Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                    return WindowInsets.CONSUMED;
                }
            });
        }
        web.loadUrl("file:///android_asset/app/index.html");
    }
    public class DisplayBridge {
        @JavascriptInterface public void setImmersive(final boolean enabled) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (Build.VERSION.SDK_INT >= 30) {
                        WindowInsetsController controller = getWindow().getInsetsController();
                        if (controller != null) {
                            controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                            if (enabled) controller.hide(WindowInsets.Type.systemBars());
                            else controller.show(WindowInsets.Type.systemBars());
                        }
                    } else {
                        getWindow().getDecorView().setSystemUiVisibility(enabled
                            ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            : View.SYSTEM_UI_FLAG_VISIBLE);
                    }
                    web.requestApplyInsets();
                }
            });
        }
    }
    @Override protected void onPause() {
        if (web != null) { web.evaluateJavascript("window.dispatchEvent(new Event('appPause'))", null); web.onPause(); web.pauseTimers(); }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (web != null) { web.onResume(); web.resumeTimers(); web.evaluateJavascript("window.dispatchEvent(new Event('appResume'))", null); }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.returnToSimulation ? window.returnToSimulation() : false", new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) { if (!"true".equals(value)) finish(); }
        });
    }
    @Override protected void onDestroy() { if (web != null) web.destroy(); super.onDestroy(); }
}
