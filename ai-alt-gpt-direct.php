<?php
/**
 * Plugin Name: AI Alt Text Generator (Direct Stripe)
 * Description: Generate AI alt text with direct Stripe payment links
 * Version: 4.1.0
 */

if (!defined('ABSPATH')) exit;

class AI_Alt_Text_Generator_Direct {
    
    private $stripe_links = [
        'pro' => 'https://buy.stripe.com/test_pro',
        'agency' => 'https://buy.stripe.com/test_agency', 
        'credits' => 'https://buy.stripe.com/test_credits'
    ];
    
    public function __construct() {
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('wp_ajax_ai_alt_upgrade', [$this, 'handle_upgrade']);
    }
    
    public function add_admin_menu() {
        add_media_page(
            'AI Alt Text Generator',
            'AI Alt Text',
            'manage_options',
            'ai-alt-text',
            [$this, 'render_dashboard']
        );
    }
    
    public function render_dashboard() {
        ?>
        <div class="wrap">
            <h1>AI Alt Text Generator</h1>
            
            <div class="card">
                <h2>Upgrade Your Plan</h2>
                <div class="pricing-grid">
                    <div class="plan-card">
                        <h3>Pro Plan</h3>
                        <div class="price">£12.99/month</div>
                        <ul>
                            <li>1000 images per month</li>
                            <li>Advanced quality scoring</li>
                            <li>Bulk processing</li>
                        </ul>
                        <a href="<?php echo esc_url($this->stripe_links['pro']); ?>" 
                           class="button button-primary button-large" 
                           target="_blank">Upgrade to Pro</a>
                    </div>
                    
                    <div class="plan-card">
                        <h3>Agency Plan</h3>
                        <div class="price">£49.99/month</div>
                        <ul>
                            <li>10,000 images per month</li>
                            <li>White-label options</li>
                            <li>Priority support</li>
                        </ul>
                        <a href="<?php echo esc_url($this->stripe_links['agency']); ?>" 
                           class="button button-primary button-large" 
                           target="_blank">Upgrade to Agency</a>
                    </div>
                    
                    <div class="plan-card">
                        <h3>Credits Pack</h3>
                        <div class="price">£9.99 one-time</div>
                        <ul>
                            <li>100 images</li>
                            <li>No expiration</li>
                            <li>Use with any plan</li>
                        </ul>
                        <a href="<?php echo esc_url($this->stripe_links['credits']); ?>" 
                           class="button button-primary button-large" 
                           target="_blank">Buy Credits</a>
                    </div>
                </div>
            </div>
        </div>
        
        <style>
        .pricing-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        
        .plan-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            background: #fff;
        }
        
        .plan-card h3 {
            margin-top: 0;
            color: #0073aa;
        }
        
        .price {
            font-size: 24px;
            font-weight: bold;
            color: #0073aa;
            margin: 10px 0;
        }
        
        .plan-card ul {
            list-style: none;
            padding: 0;
            margin: 15px 0;
        }
        
        .plan-card li {
            padding: 5px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .button-large {
            font-size: 16px;
            padding: 12px 24px;
            margin-top: 15px;
        }
        </style>
        <?php
    }
    
    public function handle_upgrade() {
        $plan = sanitize_text_field($_POST['plan'] ?? 'pro');
        $url = $this->stripe_links[$plan] ?? $this->stripe_links['pro'];
        wp_redirect($url);
        exit;
    }
}

new AI_Alt_Text_Generator_Direct();
